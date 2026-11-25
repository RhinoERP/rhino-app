-- Phase 2: additive command identity, common finalization and human dispatch.
-- Existing source_message_id lookups/ON CONFLICT remain valid for v2 workers.
ALTER TABLE public.whatsapp_outbox
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'AGENT' CHECK(origin IN ('AGENT','HUMAN')),
  ADD COLUMN IF NOT EXISTS integration_id uuid,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS control_version integer,
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason_code text;
UPDATE public.whatsapp_outbox x SET integration_id=c.integration_id
  FROM public.whatsapp_conversations c WHERE c.id=x.conversation_id AND x.integration_id IS NULL;
ALTER TABLE public.whatsapp_outbox ALTER COLUMN integration_id SET NOT NULL;
UPDATE public.whatsapp_outbox SET lease_expires_at=updated_at+interval '60 seconds'
  WHERE status='SENDING' AND lease_expires_at IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.whatsapp_outbox'::regclass AND conname='whatsapp_outbox_source_key') THEN
    ALTER TABLE public.whatsapp_outbox DROP CONSTRAINT whatsapp_outbox_pkey;
    ALTER TABLE public.whatsapp_outbox ALTER COLUMN source_message_id DROP NOT NULL;
    ALTER TABLE public.whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_pkey PRIMARY KEY(id),
      ADD CONSTRAINT whatsapp_outbox_source_key UNIQUE(source_message_id),
      ADD CONSTRAINT whatsapp_outbox_request_key UNIQUE(organization_id,client_request_id),
      ADD CONSTRAINT whatsapp_outbox_channel_fkey FOREIGN KEY(conversation_id,organization_id,integration_id)
        REFERENCES public.whatsapp_conversations(id,organization_id,integration_id) ON DELETE CASCADE,
      ADD CONSTRAINT whatsapp_outbox_human_check CHECK (
        (origin='AGENT' AND source_message_id IS NOT NULL AND client_request_id IS NULL AND actor_user_id IS NULL)
        OR (origin='HUMAN' AND source_message_id IS NULL AND client_request_id IS NOT NULL
          AND actor_user_id IS NOT NULL AND control_version IS NOT NULL AND NOT order_prompt));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS whatsapp_outbox_human_pending_idx ON public.whatsapp_outbox(available_at,created_at,id)
  WHERE origin='HUMAN' AND status='PENDING';
CREATE INDEX IF NOT EXISTS whatsapp_outbox_dispatch_expiry_idx ON public.whatsapp_outbox(lease_expires_at,conversation_id) WHERE status='SENDING';
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_outbox_external_key ON public.whatsapp_outbox(external_message_id) WHERE external_message_id IS NOT NULL;
ALTER TABLE public.whatsapp_conversations ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'LEGACY' CHECK(origin IN ('AGENT','HUMAN','LEGACY')),
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_author_check;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_author_check
  CHECK ((origin='HUMAN' AND sender_user_id IS NOT NULL AND direction='OUTBOUND') OR (origin<>'HUMAN' AND sender_user_id IS NULL));

-- Parse provider evidence, never the parser's display-time fallback or sent_at.
CREATE OR REPLACE FUNCTION public.whatsapp_customer_timestamp(p_payload jsonb)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN p_payload->>'timestamp' ~ '^[0-9]{1,10}$'
    THEN to_timestamp((p_payload->>'timestamp')::double precision) END
$$;
UPDATE public.whatsapp_conversations c SET last_customer_message_at=greatest(c.last_customer_message_at,e.ts)
FROM (SELECT m.conversation_id,max(public.whatsapp_customer_timestamp(m.payload)) ts
  FROM public.whatsapp_messages m JOIN public.whatsapp_integrations wi ON wi.id=m.integration_id
  WHERE m.direction='INBOUND' AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    AND m.payload->>'id'=m.external_message_id
    AND public.whatsapp_customer_timestamp(m.payload)>to_timestamp(0)
    AND public.whatsapp_customer_timestamp(m.payload)<=clock_timestamp()
  GROUP BY m.conversation_id) e WHERE c.id=e.conversation_id;

CREATE OR REPLACE FUNCTION public.whatsapp_message_delivery_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; ts timestamptz;
BEGIN
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id=NEW.conversation_id
    AND organization_id=NEW.organization_id AND integration_id=NEW.integration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no disponible'; END IF;
  IF NEW.origin='HUMAN' AND NOT EXISTS(SELECT 1 FROM public.whatsapp_outbox
    WHERE organization_id=NEW.organization_id AND conversation_id=NEW.conversation_id
      AND actor_user_id=NEW.sender_user_id AND origin='HUMAN' AND status IN ('SENDING','UNKNOWN')) THEN
    RAISE EXCEPTION 'Autor de otra organización';
  END IF;
  IF NEW.direction='INBOUND' AND NEW.payload->>'id'=NEW.external_message_id
    AND EXISTS(SELECT 1 FROM public.whatsapp_integrations WHERE id=NEW.integration_id
      AND phone_number_id NOT LIKE 'rhinos-local-simulator:%') THEN
    ts:=public.whatsapp_customer_timestamp(NEW.payload);
    IF ts>to_timestamp(0) AND ts<=clock_timestamp() THEN
      UPDATE public.whatsapp_conversations SET last_customer_message_at=greatest(last_customer_message_at,ts) WHERE id=c.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_message_delivery_identity ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_message_delivery_identity BEFORE INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_message_delivery_identity();

-- Fill the new channel column for old agent INSERTs without changing their ABI.
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.integration_id IS NULL THEN
    SELECT integration_id INTO NEW.integration_id FROM public.whatsapp_conversations
      WHERE id=NEW.conversation_id AND organization_id=NEW.organization_id;
  END IF;
  IF NEW.origin='AGENT' AND NOT EXISTS(SELECT 1 FROM public.whatsapp_messages
    WHERE id=NEW.source_message_id AND conversation_id=NEW.conversation_id
      AND organization_id=NEW.organization_id AND integration_id=NEW.integration_id AND direction='INBOUND') THEN
    RAISE EXCEPTION 'Origen de comando inválido';
  END IF;
  IF NEW.origin='HUMAN' AND NOT public.whatsapp_actor_can_manage(NEW.organization_id,NEW.actor_user_id) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='Autor no autorizado';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_outbox_identity ON public.whatsapp_outbox;
CREATE TRIGGER whatsapp_outbox_identity BEFORE INSERT ON public.whatsapp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_outbox_identity();

CREATE OR REPLACE FUNCTION public.whatsapp_command_dto(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('id',x.id,'clientRequestId',x.client_request_id,'status',x.status,
    'reasonCode',x.reason_code,'createdAt',x.created_at,'updatedAt',x.updated_at,
    'messageId',(SELECT id FROM public.whatsapp_messages WHERE external_message_id=x.external_message_id
      AND integration_id=x.integration_id AND organization_id=x.organization_id))
  FROM public.whatsapp_outbox x WHERE x.id=p_id
$$;

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_human_message(
  p_organization_id uuid,p_conversation_id uuid,p_actor_id uuid,p_expected_control_version integer,
  p_client_request_id uuid,p_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; x public.whatsapp_outbox%ROWTYPE; wi public.whatsapp_integrations%ROWTYPE;
BEGIN
  IF NOT public.whatsapp_actor_can_manage(p_organization_id,p_actor_id) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='Se requiere whatsapp.manage'; END IF;
  IF p_client_request_id IS NULL OR p_expected_control_version IS NULL OR p_expected_control_version<0
    OR coalesce(length(btrim(p_text)),0) NOT BETWEEN 1 AND 4000 THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Comando inválido'; END IF;
  -- Same key across different chats must serialize too, before taking a chat lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_client_request_id::text,0));
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id=p_conversation_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501' USING MESSAGE='Conversación no disponible'; END IF;
  SELECT * INTO wi FROM public.whatsapp_integrations WHERE id=c.integration_id AND organization_id=c.organization_id;
  IF wi.status<>'ACTIVE' OR wi.phone_number_id LIKE 'rhinos-local-simulator:%'
    OR NOT public.is_whatsapp_mode_enabled(c.organization_id,wi.phone_number_id) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='Canal no disponible'; END IF;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE organization_id=p_organization_id AND client_request_id=p_client_request_id;
  IF FOUND THEN
    IF (x.conversation_id,x.actor_user_id,x.control_version,x.text)
      IS DISTINCT FROM (p_conversation_id,p_actor_id,p_expected_control_version,btrim(p_text)) THEN
      RETURN jsonb_build_object('success',false,'code','IDEMPOTENCY_CONFLICT'); END IF;
    RETURN jsonb_build_object('success',true,'replayed',true,'command',public.whatsapp_command_dto(x.id));
  END IF;
  IF c.control_version<>p_expected_control_version OR c.status<>'HANDOFF' OR c.human_claimed_at IS NULL OR c.assigned_user_id<>p_actor_id THEN
    RETURN jsonb_build_object('success',false,'code','CONTROL_CONFLICT'); END IF;
  IF EXISTS(SELECT 1 FROM public.whatsapp_outbox WHERE conversation_id=c.id AND status IN ('SENDING','UNKNOWN')) THEN
    RETURN jsonb_build_object('success',false,'code','DELIVERY_UNRESOLVED'); END IF;
  IF c.last_customer_message_at IS NULL OR c.last_customer_message_at+interval '24 hours'<=clock_timestamp() THEN
    RETURN jsonb_build_object('success',false,'code','WINDOW_EXPIRED'); END IF;
  INSERT INTO public.whatsapp_outbox(organization_id,conversation_id,integration_id,origin,actor_user_id,control_version,client_request_id,text)
    VALUES(c.organization_id,c.id,c.integration_id,'HUMAN',p_actor_id,p_expected_control_version,p_client_request_id,btrim(p_text)) RETURNING * INTO x;
  RETURN jsonb_build_object('success',true,'replayed',false,'command',public.whatsapp_command_dto(x.id));
END $$;

-- Lock conversations first: never outbox -> conversation (control uses the reverse).
CREATE OR REPLACE FUNCTION public.claim_whatsapp_human_outbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; x public.whatsapp_outbox%ROWTYPE; wi public.whatsapp_integrations%ROWTYPE; reason text;
BEGIN
  FOR c IN SELECT conv.* FROM public.whatsapp_conversations conv WHERE EXISTS(
    SELECT 1 FROM public.whatsapp_outbox q WHERE q.conversation_id=conv.id
      AND ((q.origin='HUMAN' AND q.status='PENDING' AND q.available_at<=clock_timestamp() AND NOT EXISTS(
        SELECT 1 FROM public.whatsapp_outbox blocked WHERE blocked.conversation_id=conv.id AND blocked.status IN ('SENDING','UNKNOWN')))
        OR (q.status='SENDING' AND q.lease_expires_at<=clock_timestamp())))
    ORDER BY conv.id LIMIT 50 FOR UPDATE OF conv SKIP LOCKED
  LOOP
    UPDATE public.whatsapp_outbox SET status='UNKNOWN',reason_code='DELIVERY_UNKNOWN',updated_at=clock_timestamp()
      WHERE conversation_id=c.id AND status='SENDING' AND lease_expires_at<=clock_timestamp();
    IF EXISTS(SELECT 1 FROM public.whatsapp_outbox WHERE conversation_id=c.id AND status IN ('SENDING','UNKNOWN')) THEN CONTINUE; END IF;
    SELECT * INTO x FROM public.whatsapp_outbox WHERE conversation_id=c.id AND origin='HUMAN'
      AND status='PENDING' AND available_at<=clock_timestamp() ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO wi FROM public.whatsapp_integrations WHERE id=c.integration_id AND organization_id=c.organization_id;
    reason:=CASE
      WHEN wi.status<>'ACTIVE' OR wi.phone_number_id LIKE 'rhinos-local-simulator:%'
        OR NOT public.is_whatsapp_mode_enabled(c.organization_id,wi.phone_number_id) THEN 'CHANNEL_UNAVAILABLE'
      WHEN NOT public.whatsapp_actor_can_manage(c.organization_id,x.actor_user_id) THEN 'ACCESS_REVOKED'
      WHEN c.status<>'HANDOFF' OR c.human_claimed_at IS NULL OR c.assigned_user_id IS DISTINCT FROM x.actor_user_id
        OR c.control_version<>x.control_version THEN 'CONTROL_CONFLICT'
      WHEN c.last_customer_message_at IS NULL OR c.last_customer_message_at+interval '24 hours'<=clock_timestamp() THEN 'WINDOW_EXPIRED'
      WHEN x.attempts>=5 THEN 'RETRY_EXHAUSTED' END;
    IF reason IS NOT NULL THEN
      UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code=reason,updated_at=clock_timestamp() WHERE id=x.id;
      CONTINUE;
    END IF;
    UPDATE public.whatsapp_outbox SET status='SENDING',lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',
      attempts=attempts+1,reason_code=NULL,updated_at=clock_timestamp() WHERE id=x.id RETURNING * INTO x;
    RETURN to_jsonb(x)||jsonb_build_object('phone_number_id',wi.phone_number_id,'recipient',c.customer_phone);
  END LOOP;
  RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_facts (
  integration_id uuid NOT NULL, organization_id uuid NOT NULL, external_message_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('SENT','DELIVERED','READ','FAILED')), occurred_at timestamptz NOT NULL,
  PRIMARY KEY(integration_id,external_message_id,status,occurred_at),
  FOREIGN KEY(integration_id,organization_id) REFERENCES public.whatsapp_integrations(id,organization_id) ON DELETE CASCADE
);
CREATE OR REPLACE FUNCTION public.reconcile_whatsapp_delivery(p_integration_id uuid,p_external_message_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.whatsapp_messages m SET delivery_status=f.status FROM (
    SELECT status FROM public.whatsapp_delivery_facts WHERE integration_id=p_integration_id AND external_message_id=p_external_message_id
      ORDER BY CASE status WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 ELSE 1 END DESC LIMIT 1
  ) f WHERE m.integration_id=p_integration_id AND m.external_message_id=p_external_message_id AND m.direction='OUTBOUND'
    AND CASE f.status WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 ELSE 1 END
      > CASE m.delivery_status WHEN 'READ' THEN 4 WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 2 WHEN 'SENT' THEN 1 ELSE 0 END
$$;
CREATE OR REPLACE FUNCTION public.whatsapp_reconcile_outbound() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.direction='OUTBOUND' AND NEW.external_message_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.integration_id::text||NEW.external_message_id,0));
    PERFORM public.reconcile_whatsapp_delivery(NEW.integration_id,NEW.external_message_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_reconcile_outbound ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_reconcile_outbound AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.whatsapp_reconcile_outbound();

CREATE OR REPLACE FUNCTION public.record_whatsapp_delivery_status_scoped(p_phone_number_id text,p_external_message_id text,p_delivery_status text,p_status_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE wi public.whatsapp_integrations%ROWTYPE;
BEGIN
  SELECT * INTO wi FROM public.whatsapp_integrations WHERE phone_number_id=p_phone_number_id;
  IF NOT FOUND OR wi.phone_number_id LIKE 'rhinos-local-simulator:%' THEN RETURN false; END IF;
  IF p_delivery_status IS NULL OR p_delivery_status NOT IN ('SENT','DELIVERED','READ','FAILED') OR p_status_at IS NULL THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Estado inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(wi.id::text||p_external_message_id,0));
  INSERT INTO public.whatsapp_delivery_facts VALUES(wi.id,wi.organization_id,p_external_message_id,p_delivery_status,p_status_at) ON CONFLICT DO NOTHING;
  PERFORM public.reconcile_whatsapp_delivery(wi.id,p_external_message_id);
  RETURN true;
END $$;
-- Old webhook ABI remains safe for already-known messages; early callbacks need scope.
CREATE OR REPLACE FUNCTION public.record_whatsapp_delivery_status(p_external_message_id text,p_delivery_status text,p_status_at timestamptz DEFAULT now(),p_payload jsonb DEFAULT '{}')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE phone text;
BEGIN
  SELECT wi.phone_number_id INTO phone FROM public.whatsapp_messages m JOIN public.whatsapp_integrations wi ON wi.id=m.integration_id
    WHERE m.external_message_id=p_external_message_id AND m.direction='OUTBOUND';
  IF phone IS NULL THEN RETURN false; END IF;
  RETURN public.record_whatsapp_delivery_status_scoped(phone,p_external_message_id,p_delivery_status,p_status_at);
END $$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_command(p_command_id uuid,p_lease_token uuid,p_status text,p_external_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.whatsapp_outbox%ROWTYPE; c public.whatsapp_conversations%ROWTYPE; existing public.whatsapp_messages%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('PENDING','SENT','UNKNOWN','CANCELLED') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  SELECT conv.* INTO c FROM public.whatsapp_conversations conv JOIN public.whatsapp_outbox q ON q.conversation_id=conv.id
    AND q.organization_id=conv.organization_id WHERE q.id=p_command_id FOR UPDATE OF conv;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE id=p_command_id FOR UPDATE;
  IF x.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN RETURN false; END IF;
  IF x.status='SENT' THEN RETURN p_status='SENT' AND x.external_message_id IS NOT DISTINCT FROM p_external_message_id; END IF;
  IF x.status NOT IN ('SENDING','UNKNOWN') OR (x.status='UNKNOWN' AND p_status='PENDING') THEN RETURN false; END IF;
  IF p_status='SENT' THEN
    IF coalesce(btrim(p_external_message_id),'')='' THEN RAISE EXCEPTION 'Falta identificador externo'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(x.integration_id::text||p_external_message_id,0));
    SELECT * INTO existing FROM public.whatsapp_messages WHERE external_message_id=p_external_message_id;
    IF FOUND AND (existing.organization_id,existing.conversation_id,existing.integration_id,existing.direction,existing.content)
      IS DISTINCT FROM (x.organization_id,x.conversation_id,x.integration_id,'OUTBOUND'::text,x.text) THEN
      RAISE EXCEPTION 'Identificador externo ya registrado'; END IF;
    INSERT INTO public.whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,payload,delivery_status,sent_at,origin,sender_user_id)
      VALUES(x.organization_id,x.integration_id,x.conversation_id,p_external_message_id,'OUTBOUND','TEXT',x.text,
        jsonb_build_object('provider','META_CLOUD','sourceMessageId',x.source_message_id,'orderPrompt',x.order_prompt),'SENT',clock_timestamp(),x.origin,x.actor_user_id)
      ON CONFLICT(external_message_id) DO NOTHING;
    UPDATE public.whatsapp_conversations SET last_message_at=greatest(last_message_at,clock_timestamp()) WHERE id=c.id;
  END IF;
  UPDATE public.whatsapp_outbox SET status=p_status,external_message_id=coalesce(p_external_message_id,external_message_id),updated_at=clock_timestamp(),
    reason_code=CASE p_status WHEN 'UNKNOWN' THEN 'DELIVERY_UNKNOWN' WHEN 'CANCELLED' THEN 'PROVIDER_REJECTED' ELSE NULL END,
    available_at=CASE WHEN p_status='PENDING' THEN clock_timestamp()+make_interval(secs=>least(300,5*(2^attempts)::integer)) ELSE available_at END
    WHERE id=x.id;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.complete_whatsapp_outbox(p_source_message_id uuid,p_lease_token uuid,p_status text,p_external_message_id text DEFAULT null)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.complete_whatsapp_command((SELECT id FROM public.whatsapp_outbox WHERE source_message_id=p_source_message_id),p_lease_token,p_status,p_external_message_id)
$$;

CREATE OR REPLACE FUNCTION public.resolve_whatsapp_unknown(
  p_organization_id uuid,p_conversation_id uuid,p_command_id uuid,p_actor_id uuid,
  p_expected_control_version integer,p_resolution text,p_reason text,p_external_message_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; x public.whatsapp_outbox%ROWTYPE;
BEGIN
  IF NOT public.whatsapp_actor_can_manage(p_organization_id,p_actor_id) THEN RAISE SQLSTATE '42501' USING MESSAGE='Se requiere whatsapp.manage'; END IF;
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id=p_conversation_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_whatsapp_mode_enabled(c.organization_id,(SELECT phone_number_id FROM public.whatsapp_integrations WHERE id=c.integration_id)) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='Conversación no disponible'; END IF;
  IF p_expected_control_version IS NULL OR c.control_version<>p_expected_control_version THEN
    RETURN jsonb_build_object('success',false,'code','CONTROL_CONFLICT'); END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('SENT','CANCELLED') OR coalesce(length(btrim(p_reason)),0) NOT BETWEEN 5 AND 1000
    OR (p_resolution='CANCELLED' AND p_external_message_id IS NOT NULL) THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Revisión inválida'; END IF;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE id=p_command_id AND conversation_id=c.id AND organization_id=c.organization_id FOR UPDATE;
  IF NOT FOUND OR x.status<>'UNKNOWN' THEN RETURN jsonb_build_object('success',false,'code','REVIEW_CONFLICT'); END IF;
  UPDATE public.whatsapp_outbox SET lease_token=gen_random_uuid() WHERE id=x.id RETURNING * INTO x;
  IF NOT public.complete_whatsapp_command(x.id,x.lease_token,p_resolution,p_external_message_id) THEN
    RETURN jsonb_build_object('success',false,'code','REVIEW_CONFLICT'); END IF;
  UPDATE public.whatsapp_conversations SET control_version=control_version+1,pending_order_action=NULL WHERE id=c.id RETURNING * INTO c;
  -- A review changes the version; commands authorized before it cannot be sent.
  UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code='CONTROL_CONFLICT' WHERE conversation_id=c.id AND status='PENDING';
  INSERT INTO public.whatsapp_conversation_events(organization_id,conversation_id,type,actor_user_id,control_version,reason,command_id)
    VALUES(c.organization_id,c.id,'DELIVERY_REVIEW',p_actor_id,c.control_version,btrim(p_reason),x.id);
  RETURN jsonb_build_object('success',true,'command',public.whatsapp_command_dto(x.id));
END $$;
ALTER TABLE public.whatsapp_conversation_events DROP CONSTRAINT IF EXISTS whatsapp_conversation_events_type_check;
ALTER TABLE public.whatsapp_conversation_events ADD CONSTRAINT whatsapp_conversation_events_type_check
  CHECK(type IN ('HANDOFF','CLAIM','TRANSFER','PAUSE','RESUME','DELIVERY_REVIEW'));
ALTER TABLE public.whatsapp_conversation_events ADD COLUMN IF NOT EXISTS command_id uuid REFERENCES public.whatsapp_outbox(id);

CREATE OR REPLACE FUNCTION public.prepare_whatsapp_outbox(p_job_id uuid,p_lease_token uuid,p_text text,p_order_prompt boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.agent_jobs%ROWTYPE; x public.whatsapp_outbox%ROWTYPE;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  INSERT INTO public.whatsapp_outbox(source_message_id,organization_id,conversation_id,text,order_prompt)
    VALUES(j.source_message_id,j.organization_id,j.conversation_id,p_text,p_order_prompt) ON CONFLICT DO NOTHING;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE source_message_id = j.source_message_id FOR UPDATE;
  IF j.lease_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'El trabajo perdió su exclusión'; END IF;
  IF x.status = 'SENDING' THEN
    UPDATE public.whatsapp_outbox SET status = 'UNKNOWN',updated_at = clock_timestamp()
      WHERE source_message_id = j.source_message_id RETURNING * INTO x;
  ELSIF x.status = 'PENDING' THEN
    IF j.source_message_id <> (SELECT m.id FROM public.whatsapp_messages m WHERE m.conversation_id = j.conversation_id
      AND m.direction = 'INBOUND' ORDER BY m.created_at DESC,m.id DESC LIMIT 1)
      OR EXISTS (SELECT 1 FROM public.whatsapp_outbox other WHERE other.conversation_id = j.conversation_id
        AND other.id <> x.id AND other.status IN ('SENDING','UNKNOWN'))
      OR NOT EXISTS (SELECT 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_integrations wi
        ON wi.id = c.integration_id AND wi.organization_id = c.organization_id
        WHERE c.id = j.conversation_id AND wi.id = j.integration_id AND wi.status = 'ACTIVE'
          AND public.is_whatsapp_mode_enabled(j.organization_id,wi.phone_number_id)
          AND (c.automation_resumed_at IS NULL OR (SELECT created_at FROM public.whatsapp_messages WHERE id = j.source_message_id) > c.automation_resumed_at)
          AND (wi.phone_number_id LIKE 'rhinos-local-simulator:%' OR c.last_customer_message_at + interval '24 hours' > clock_timestamp())
          AND (c.status = 'ACTIVE' OR (c.status = 'HANDOFF' AND c.human_claimed_at IS NULL AND NOT x.order_prompt
            AND EXISTS (SELECT 1 FROM public.whatsapp_conversation_events e WHERE e.conversation_id = c.id
              AND e.control_version = c.control_version AND e.type = 'HANDOFF' AND e.source_message_id = j.source_message_id)))) THEN
      UPDATE public.whatsapp_outbox SET status = 'CANCELLED',updated_at = clock_timestamp()
        WHERE source_message_id = j.source_message_id RETURNING * INTO x;
    ELSE
      UPDATE public.whatsapp_outbox SET status = 'SENDING',lease_token = p_lease_token,updated_at = clock_timestamp(),
        lease_expires_at = clock_timestamp()+interval '60 seconds',
        text = CASE WHEN (SELECT status FROM public.whatsapp_conversations WHERE id=j.conversation_id)='HANDOFF'
          THEN coalesce((SELECT handoff_message FROM public.whatsapp_integrations WHERE id=j.integration_id),
            'Una persona del equipo comercial va a continuar la atención por este chat.') ELSE text END
        WHERE source_message_id = j.source_message_id RETURNING * INTO x;
    END IF;
  END IF;
  RETURN to_jsonb(x);
END $$;


-- Protect every new helper, including functions installed under Supabase defaults.
DO $$ DECLARE fn record; BEGIN
  FOR fn IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
    'whatsapp_customer_timestamp','whatsapp_message_delivery_identity','whatsapp_outbox_identity','whatsapp_command_dto',
    'enqueue_whatsapp_human_message','claim_whatsapp_human_outbox','reconcile_whatsapp_delivery','whatsapp_reconcile_outbound',
    'record_whatsapp_delivery_status_scoped','record_whatsapp_delivery_status','complete_whatsapp_command','complete_whatsapp_outbox','resolve_whatsapp_unknown') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.sig);
  END LOOP;
END $$;
ALTER TABLE public.whatsapp_delivery_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_delivery_facts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.whatsapp_delivery_facts TO service_role;
CREATE OR REPLACE FUNCTION public.whatsapp_human_outbox_protocol_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN public.whatsapp_worker_protocol_version()=2 AND NOT EXISTS(
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
      ('enqueue_whatsapp_human_message','claim_whatsapp_human_outbox','complete_whatsapp_command','resolve_whatsapp_unknown','whatsapp_command_dto',
       'whatsapp_message_delivery_identity','whatsapp_outbox_identity','reconcile_whatsapp_delivery','whatsapp_reconcile_outbound',
       'record_whatsapp_delivery_status_scoped','control_whatsapp_conversation','handoff_whatsapp_conversation','list_whatsapp_control_operators',
       'whatsapp_actor_can_manage','whatsapp_conversation_control_state','whatsapp_human_outbox_protocol_version')
      AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))
  ) AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['whatsapp_outbox','whatsapp_messages','whatsapp_conversations','whatsapp_conversation_events','whatsapp_delivery_facts']) t(name)
    WHERE has_table_privilege('anon','public.'||t.name,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.'||t.name,'SELECT,INSERT,UPDATE,DELETE')) THEN 1 ELSE 0 END
$$;
REVOKE ALL ON FUNCTION public.whatsapp_human_outbox_protocol_version() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_human_outbox_protocol_version() TO service_role;
NOTIFY pgrst,'reload schema';
