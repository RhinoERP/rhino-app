-- Optional, single follow-up after an ordinary agent reply. No historical backfill.
ALTER TABLE public.whatsapp_integrations ADD COLUMN IF NOT EXISTS follow_up jsonb NOT NULL DEFAULT
  '{"enabled":false,"delayMinutes":30,"instructions":"Retomá brevemente la consulta comercial y ofrecé ayuda para resolver dudas o elegir. Usá el contexto, sin presionar ni repetir ofertas rechazadas."}'::jsonb;
ALTER TABLE public.whatsapp_integrations DROP CONSTRAINT IF EXISTS whatsapp_integrations_follow_up_check;
ALTER TABLE public.whatsapp_integrations ADD CONSTRAINT whatsapp_integrations_follow_up_check CHECK (
  jsonb_typeof(follow_up)='object' AND follow_up ?& ARRAY['enabled','delayMinutes','instructions']
  AND jsonb_typeof(follow_up->'enabled')='boolean'
  AND jsonb_typeof(follow_up->'delayMinutes')='number'
  AND (follow_up->>'delayMinutes')::numeric BETWEEN 1 AND 1380
  AND (follow_up->>'delayMinutes')::numeric=trunc((follow_up->>'delayMinutes')::numeric)
  AND jsonb_typeof(follow_up->'instructions')='string' AND length(follow_up->>'instructions')<=2000
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_follow_up_identity_key
  ON public.whatsapp_messages(id,organization_id,integration_id,conversation_id);
CREATE TABLE IF NOT EXISTS public.whatsapp_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL UNIQUE,
  inbound_message_id uuid NOT NULL,
  control_version integer NOT NULL,
  state_key text NOT NULL,
  pricing_context jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','SENT','SKIPPED','CANCELLED','FAILED','UNKNOWN')),
  available_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token uuid,
  lease_expires_at timestamptz,
  reason text,
  decision jsonb,
  last_error text,
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,organization_id,integration_id,conversation_id),
  FOREIGN KEY(conversation_id,organization_id,integration_id)
    REFERENCES public.whatsapp_conversations(id,organization_id,integration_id) ON DELETE CASCADE,
  FOREIGN KEY(source_message_id,organization_id,integration_id,conversation_id)
    REFERENCES public.whatsapp_messages(id,organization_id,integration_id,conversation_id) ON DELETE CASCADE,
  FOREIGN KEY(inbound_message_id,organization_id,integration_id,conversation_id)
    REFERENCES public.whatsapp_messages(id,organization_id,integration_id,conversation_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_follow_ups_due_idx ON public.whatsapp_follow_ups(available_at,id)
  WHERE status IN ('PENDING','PROCESSING');
CREATE INDEX IF NOT EXISTS whatsapp_follow_ups_conversation_idx ON public.whatsapp_follow_ups(conversation_id)
  WHERE status IN ('PENDING','PROCESSING');
ALTER TABLE public.whatsapp_follow_ups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_follow_ups FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.whatsapp_follow_ups TO service_role;

-- Keep AGENT/HUMAN message origins and the ordinary one-reply-per-inbound key.
-- Follow-ups have their own identity and never occupy source_message_id.
ALTER TABLE public.whatsapp_outbox ADD COLUMN IF NOT EXISTS follow_up_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_outbox_follow_up_key ON public.whatsapp_outbox(follow_up_id);
ALTER TABLE public.whatsapp_outbox DROP CONSTRAINT IF EXISTS whatsapp_outbox_follow_up_fkey;
ALTER TABLE public.whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_follow_up_fkey
  FOREIGN KEY(follow_up_id,organization_id,integration_id,conversation_id)
  REFERENCES public.whatsapp_follow_ups(id,organization_id,integration_id,conversation_id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_outbox DROP CONSTRAINT IF EXISTS whatsapp_outbox_human_check;
ALTER TABLE public.whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_human_check CHECK (
  (origin='AGENT' AND client_request_id IS NULL AND actor_user_id IS NULL AND
    ((source_message_id IS NOT NULL AND follow_up_id IS NULL) OR
     (source_message_id IS NULL AND follow_up_id IS NOT NULL AND control_version IS NOT NULL AND NOT order_prompt)))
  OR (origin='HUMAN' AND source_message_id IS NULL AND follow_up_id IS NULL AND client_request_id IS NOT NULL
    AND actor_user_id IS NOT NULL AND control_version IS NOT NULL AND NOT order_prompt)
);
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.integration_id IS NULL THEN
    SELECT integration_id INTO NEW.integration_id FROM public.whatsapp_conversations
      WHERE id=NEW.conversation_id AND organization_id=NEW.organization_id;
  END IF;
  IF NEW.origin='AGENT' AND NEW.follow_up_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.whatsapp_messages
    WHERE id=NEW.source_message_id AND conversation_id=NEW.conversation_id
      AND organization_id=NEW.organization_id AND integration_id=NEW.integration_id AND direction='INBOUND') THEN
    RAISE EXCEPTION 'Origen de comando inválido';
  END IF;
  IF NEW.origin='HUMAN' AND NOT public.whatsapp_actor_can_manage(NEW.organization_id,NEW.actor_user_id) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='Autor no autorizado';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_state_key(p_chat uuid) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT md5(jsonb_build_array(c.customer_id,c.customer_linked_at,c.current_pre_sale_id,c.pending_order_action,
    (SELECT coalesce(jsonb_agg(jsonb_build_array(cart.id,cart.status,to_jsonb(cart)->'version',cart.updated_at) ORDER BY cart.id),'[]')
      FROM public.conversation_carts cart WHERE cart.conversation_id=c.id AND cart.organization_id=c.organization_id))::text)
  FROM public.whatsapp_conversations c WHERE c.id=p_chat
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_is_open(p_integration uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE hours jsonb; day jsonb; local_now timestamp;
BEGIN
  SELECT business_hours INTO hours FROM public.whatsapp_integrations WHERE id=p_integration;
  IF NOT coalesce((hours->>'enabled')::boolean,false) THEN RETURN true; END IF;
  local_now:=clock_timestamp() AT TIME ZONE (hours->>'timezone');
  day:=hours->'weeklySchedule'->(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow FROM local_now)::integer];
  RETURN coalesce((day->>'enabled')::boolean,false) AND to_char(local_now,'HH24:MI')>=day->>'start'
    AND to_char(local_now,'HH24:MI')<day->>'end';
END $$;

-- Caller holds the conversation lock; all consumers use conversation -> follow-up -> outbox.
CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_invalid_reason(p_id uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.whatsapp_follow_ups%ROWTYPE; c public.whatsapp_conversations%ROWTYPE;
  wi public.whatsapp_integrations%ROWTYPE; pricing jsonb;
BEGIN
  SELECT * INTO f FROM public.whatsapp_follow_ups WHERE id=p_id;
  SELECT * INTO c FROM public.whatsapp_conversations WHERE (id,organization_id,integration_id)=(f.conversation_id,f.organization_id,f.integration_id);
  SELECT * INTO wi FROM public.whatsapp_integrations WHERE (id,organization_id)=(f.integration_id,f.organization_id);
  IF c.id IS NULL OR wi.id IS NULL OR wi.status<>'ACTIVE'
    OR wi.phone_number_id LIKE 'rhinos-local-simulator:%'
    OR NOT public.is_whatsapp_mode_enabled(f.organization_id,wi.phone_number_id) THEN RETURN 'CHANNEL_UNAVAILABLE'; END IF;
  IF NOT (wi.follow_up->>'enabled')::boolean THEN RETURN 'FOLLOW_UP_DISABLED'; END IF;
  IF c.status<>'ACTIVE' OR c.human_claimed_at IS NOT NULL OR c.control_version<>f.control_version THEN RETURN 'CONTROL_CONFLICT'; END IF;
  IF c.last_customer_message_at IS NULL OR c.last_customer_message_at+interval '24 hours'<=clock_timestamp() THEN RETURN 'WINDOW_EXPIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_messages WHERE id=f.source_message_id AND direction='OUTBOUND'
    AND origin='AGENT' AND delivery_status IN ('SENT','DELIVERED','READ')) THEN RETURN 'SOURCE_UNAVAILABLE'; END IF;
  IF f.source_message_id IS DISTINCT FROM (SELECT id FROM public.whatsapp_messages WHERE conversation_id=c.id ORDER BY sequence_no DESC LIMIT 1)
    THEN RETURN 'NEW_MESSAGE'; END IF;
  IF public.whatsapp_follow_up_state_key(c.id) IS DISTINCT FROM f.state_key THEN RETURN 'COMMERCIAL_STATE_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.sales_orders s JOIN public.whatsapp_messages m ON m.id=f.inbound_message_id
    WHERE s.id=c.current_pre_sale_id AND s.organization_id=f.organization_id AND s.created_at>=m.created_at)
    THEN RETURN 'PURCHASE_COMPLETED'; END IF;
  pricing:=public.whatsapp_pricing_context(f.organization_id,f.integration_id,c.id);
  IF pricing->>'reason' IS NOT NULL OR pricing IS DISTINCT FROM f.pricing_context THEN RETURN 'PRICING_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.whatsapp_outbox x WHERE x.conversation_id=c.id AND x.status IN ('SENDING','UNKNOWN')
    AND x.follow_up_id IS DISTINCT FROM f.id) THEN RETURN 'DELIVERY_UNRESOLVED'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_whatsapp_follow_ups(p_chat uuid,p_reason text,p_except uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  UPDATE public.whatsapp_follow_ups SET status='CANCELLED',reason=p_reason,updated_at=clock_timestamp()
    WHERE conversation_id=p_chat AND status IN ('PENDING','PROCESSING') AND id IS DISTINCT FROM p_except;
  -- SENDING retains its identity/lease: the final preflight can cancel it, but an
  -- already accepted HTTP result must still be recorded, including after a pause.
  UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code='CONTROL_CONFLICT',updated_at=clock_timestamp()
    WHERE conversation_id=p_chat AND follow_up_id IS NOT NULL AND follow_up_id IS DISTINCT FROM p_except AND status='PENDING';
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_on_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE wi public.whatsapp_integrations%ROWTYPE; c public.whatsapp_conversations%ROWTYPE;
  original public.whatsapp_outbox%ROWTYPE; own_id uuid;
BEGIN
  -- The existing identity trigger already holds the conversation lock.
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id=NEW.conversation_id;
  IF NEW.direction='OUTBOUND' THEN
    SELECT * INTO original FROM public.whatsapp_outbox WHERE conversation_id=c.id
      AND organization_id=c.organization_id AND integration_id=c.integration_id
      AND ((source_message_id::text=NEW.payload->>'sourceMessageId' AND follow_up_id IS NULL)
        OR (follow_up_id::text=NEW.payload->>'followUpId'))
      AND status IN ('SENDING','UNKNOWN') LIMIT 1;
    own_id:=original.follow_up_id;
  END IF;
  PERFORM public.cancel_whatsapp_follow_ups(c.id,'NEW_MESSAGE',own_id);
  IF NEW.direction<>'OUTBOUND' OR NEW.origin<>'AGENT' OR original.id IS NULL OR original.follow_up_id IS NOT NULL
    OR NEW.delivery_status NOT IN ('SENT','DELIVERED','READ') THEN RETURN NEW; END IF;
  SELECT * INTO wi FROM public.whatsapp_integrations WHERE id=c.integration_id AND organization_id=c.organization_id;
  IF wi.status<>'ACTIVE' OR NOT (wi.follow_up->>'enabled')::boolean OR wi.phone_number_id LIKE 'rhinos-local-simulator:%'
    OR c.status<>'ACTIVE' OR c.human_claimed_at IS NOT NULL OR NOT public.is_whatsapp_mode_enabled(c.organization_id,wi.phone_number_id)
    -- A response accepted while a newer inbound was arriving cannot rearm a stale turn.
    OR original.source_message_id IS DISTINCT FROM (SELECT id FROM public.whatsapp_messages WHERE conversation_id=c.id
      AND direction='INBOUND' ORDER BY sequence_no DESC LIMIT 1) THEN RETURN NEW; END IF;
  INSERT INTO public.whatsapp_follow_ups(organization_id,integration_id,conversation_id,source_message_id,inbound_message_id,
    control_version,state_key,pricing_context,available_at)
    VALUES(c.organization_id,c.integration_id,c.id,NEW.id,original.source_message_id,c.control_version,
      public.whatsapp_follow_up_state_key(c.id),public.whatsapp_pricing_context(c.organization_id,c.integration_id,c.id),
      clock_timestamp()+make_interval(mins=>(wi.follow_up->>'delayMinutes')::integer))
    ON CONFLICT(source_message_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_follow_up_on_message ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_follow_up_on_message AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_follow_up_on_message();

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_on_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF (NEW.status,NEW.control_version,NEW.customer_id,NEW.customer_linked_at,NEW.current_pre_sale_id,NEW.pending_order_action)
    IS DISTINCT FROM (OLD.status,OLD.control_version,OLD.customer_id,OLD.customer_linked_at,OLD.current_pre_sale_id,OLD.pending_order_action) THEN
    PERFORM public.cancel_whatsapp_follow_ups(NEW.id,'CONTROL_CONFLICT');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_follow_up_on_control ON public.whatsapp_conversations;
CREATE TRIGGER whatsapp_follow_up_on_control AFTER UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_follow_up_on_control();

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_on_channel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE chat record;
BEGIN
  IF TG_TABLE_NAME='whatsapp_integrations' THEN
    IF NEW.status='ACTIVE' AND (NEW.follow_up->>'enabled')::boolean THEN RETURN NEW; END IF;
    FOR chat IN SELECT id FROM public.whatsapp_conversations WHERE integration_id=NEW.id ORDER BY id FOR UPDATE LOOP
      PERFORM public.cancel_whatsapp_follow_ups(chat.id,'FOLLOW_UP_DISABLED');
    END LOOP;
  ELSE
    IF NEW.is_active AND NEW.whatsapp_enabled THEN RETURN NEW; END IF;
    FOR chat IN SELECT id FROM public.whatsapp_conversations WHERE organization_id=NEW.id ORDER BY id FOR UPDATE LOOP
      PERFORM public.cancel_whatsapp_follow_ups(chat.id,'CHANNEL_UNAVAILABLE');
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_follow_up_on_channel ON public.whatsapp_integrations;
CREATE TRIGGER whatsapp_follow_up_on_channel AFTER UPDATE OF status,follow_up ON public.whatsapp_integrations
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_follow_up_on_channel();
DROP TRIGGER IF EXISTS whatsapp_follow_up_on_channel ON public.organizations;
CREATE TRIGGER whatsapp_follow_up_on_channel AFTER UPDATE OF is_active,whatsapp_enabled ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_follow_up_on_channel();

CREATE OR REPLACE FUNCTION public.claim_whatsapp_follow_up() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE candidate record; f public.whatsapp_follow_ups%ROWTYPE; x public.whatsapp_outbox%ROWTYPE; v_reason text;
BEGIN
  FOR candidate IN SELECT id,conversation_id FROM public.whatsapp_follow_ups
    WHERE (status='PENDING' AND available_at<=clock_timestamp()) OR (status='PROCESSING' AND lease_expires_at<=clock_timestamp())
      OR EXISTS(SELECT 1 FROM public.whatsapp_outbox delivery WHERE delivery.follow_up_id=whatsapp_follow_ups.id
        AND delivery.status='SENDING' AND delivery.lease_expires_at<=clock_timestamp())
    ORDER BY available_at,id LIMIT 50 LOOP
    PERFORM 1 FROM public.whatsapp_conversations WHERE id=candidate.conversation_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO f FROM public.whatsapp_follow_ups WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO x FROM public.whatsapp_outbox WHERE follow_up_id=f.id FOR UPDATE;
    IF x.status IN ('SENDING','UNKNOWN') THEN
      IF x.status='SENDING' AND x.lease_expires_at>clock_timestamp() THEN CONTINUE; END IF;
      UPDATE public.whatsapp_outbox SET status='UNKNOWN',reason_code='DELIVERY_UNKNOWN',updated_at=clock_timestamp() WHERE id=x.id;
      UPDATE public.whatsapp_follow_ups SET status='UNKNOWN',reason='DELIVERY_UNKNOWN',updated_at=clock_timestamp() WHERE id=f.id;
      CONTINUE;
    END IF;
    IF NOT ((f.status='PENDING' AND f.available_at<=clock_timestamp())
      OR (f.status='PROCESSING' AND f.lease_expires_at<=clock_timestamp())) THEN CONTINUE; END IF;
    v_reason:=public.whatsapp_follow_up_invalid_reason(f.id);
    IF v_reason IS NOT NULL OR f.attempts>=5 THEN
      UPDATE public.whatsapp_follow_ups SET status=CASE WHEN v_reason IS NULL THEN 'FAILED' ELSE 'CANCELLED' END,
        reason=coalesce(v_reason,'RETRY_EXHAUSTED'),updated_at=clock_timestamp() WHERE id=f.id;
      UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code=CASE WHEN v_reason='WINDOW_EXPIRED' THEN v_reason ELSE 'CONTROL_CONFLICT' END,
        updated_at=clock_timestamp() WHERE follow_up_id=f.id AND status='PENDING';
      CONTINUE;
    END IF;
    UPDATE public.whatsapp_follow_ups SET status='PROCESSING',attempts=attempts+1,lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
    RETURN jsonb_build_object('id',f.id,'leaseToken',f.lease_token);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.read_whatsapp_follow_up_context(p_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.whatsapp_follow_ups%ROWTYPE; v_reason text; result jsonb;
BEGIN
  PERFORM 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_follow_ups q ON q.conversation_id=c.id WHERE q.id=p_id FOR UPDATE OF c;
  SELECT * INTO f FROM public.whatsapp_follow_ups WHERE id=p_id AND status='PROCESSING' AND lease_token=p_lease_token
    AND lease_expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_reason:=public.whatsapp_follow_up_invalid_reason(f.id);
  IF v_reason IS NOT NULL THEN
    UPDATE public.whatsapp_follow_ups SET status='CANCELLED',reason=v_reason,updated_at=clock_timestamp() WHERE id=f.id;
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object('businessName',o.name,'businessHours',wi.business_hours,'instructions',wi.follow_up->>'instructions',
    'responseCapitalization',wi.commercial_rules->>'responseCapitalization',
    'windowEndsAt',c.last_customer_message_at+interval '24 hours',
    'commercialState',jsonb_build_object('pendingAction',c.pending_order_action,'hasPendingCart',EXISTS(
      SELECT 1 FROM public.conversation_carts WHERE conversation_id=c.id AND status IN ('OPEN','QUOTED','CONFIRMED'))),
    'messages',(SELECT coalesce(jsonb_agg(m.item ORDER BY m.sequence_no),'[]') FROM (
      SELECT sequence_no,jsonb_build_object('direction',direction,'content',content,'type',message_type) item
      FROM public.whatsapp_messages WHERE conversation_id=c.id AND organization_id=f.organization_id AND integration_id=f.integration_id
        -- Do not recover history from before a customer identity or pricing change.
        AND created_at>=greatest(coalesce(c.customer_linked_at,'-infinity'),coalesce(c.pricing_context_since,'-infinity'),coalesce(c.automation_resumed_at,'-infinity'))
      ORDER BY sequence_no DESC LIMIT 32) m),
    'storedText',(SELECT text FROM public.whatsapp_outbox WHERE follow_up_id=f.id AND status='PENDING'))
  INTO result FROM public.whatsapp_conversations c JOIN public.whatsapp_integrations wi ON wi.id=c.integration_id
    JOIN public.organizations o ON o.id=c.organization_id WHERE c.id=f.conversation_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.finish_whatsapp_follow_up(p_id uuid,p_lease_token uuid,p_action text,p_reason text DEFAULT NULL,
  p_defer_until timestamptz DEFAULT NULL,p_model text DEFAULT NULL,p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL,p_latency_ms integer DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.whatsapp_follow_ups%ROWTYPE;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('SKIP','RETRY','DEFER') THEN RAISE EXCEPTION 'Acción inválida'; END IF;
  PERFORM 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_follow_ups q ON q.conversation_id=c.id WHERE q.id=p_id FOR UPDATE OF c;
  SELECT * INTO f FROM public.whatsapp_follow_ups WHERE id=p_id AND lease_token=p_lease_token AND status='PROCESSING'
    AND lease_expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- HTTP may already have begun. Only completion/review can resolve that command.
  IF EXISTS(SELECT 1 FROM public.whatsapp_outbox WHERE follow_up_id=f.id AND status IN ('SENDING','SENT','UNKNOWN')) THEN RETURN false; END IF;
  IF p_action='DEFER' AND (p_defer_until IS NULL OR p_defer_until<=clock_timestamp()) THEN RAISE EXCEPTION 'Fecha inválida'; END IF;
  UPDATE public.whatsapp_follow_ups SET
    status=CASE WHEN p_action='SKIP' THEN 'SKIPPED' WHEN p_action='RETRY' AND attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,
    available_at=CASE WHEN p_action='DEFER' THEN p_defer_until WHEN p_action='RETRY' THEN clock_timestamp()+make_interval(secs=>least(300,5*(2^attempts)::integer)) ELSE available_at END,
    attempts=CASE WHEN p_action='DEFER' THEN greatest(0,attempts-1) ELSE attempts END,
    reason=left(p_reason,500),decision=CASE WHEN p_action='SKIP' THEN jsonb_build_object('action','SKIP','reason',left(p_reason,500)) ELSE decision END,
    last_error=CASE WHEN p_action='RETRY' THEN left(p_reason,500) ELSE last_error END,
    model=coalesce(p_model,model),input_tokens=coalesce(p_input_tokens,input_tokens),output_tokens=coalesce(p_output_tokens,output_tokens),
    latency_ms=coalesce(p_latency_ms,latency_ms),lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=f.id;
  IF p_action='SKIP' OR (p_action='RETRY' AND f.attempts>=5) THEN
    UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code=CASE WHEN p_reason='WINDOW_EXPIRED' THEN 'WINDOW_EXPIRED' ELSE 'RETRY_EXHAUSTED' END,updated_at=clock_timestamp()
      WHERE follow_up_id=f.id AND status='PENDING';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_whatsapp_follow_up(p_id uuid,p_lease_token uuid,p_text text,p_reason text,
  p_model text DEFAULT NULL,p_input_tokens integer DEFAULT NULL,p_output_tokens integer DEFAULT NULL,p_latency_ms integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.whatsapp_follow_ups%ROWTYPE; x public.whatsapp_outbox%ROWTYPE; v_reason text;
BEGIN
  PERFORM 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_follow_ups q ON q.conversation_id=c.id WHERE q.id=p_id FOR UPDATE OF c;
  SELECT * INTO f FROM public.whatsapp_follow_ups WHERE id=p_id AND lease_token=p_lease_token AND status='PROCESSING'
    AND lease_expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_reason:=public.whatsapp_follow_up_invalid_reason(f.id);
  IF v_reason IS NOT NULL THEN
    UPDATE public.whatsapp_follow_ups SET status='CANCELLED',reason=v_reason,updated_at=clock_timestamp() WHERE id=f.id;
    RETURN NULL;
  END IF;
  IF coalesce(length(btrim(p_text)),0) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Texto inválido'; END IF;
  INSERT INTO public.whatsapp_outbox(organization_id,integration_id,conversation_id,follow_up_id,control_version,text)
    VALUES(f.organization_id,f.integration_id,f.conversation_id,f.id,f.control_version,btrim(p_text)) ON CONFLICT(follow_up_id) DO NOTHING;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE follow_up_id=f.id FOR UPDATE;
  IF x.status<>'PENDING' THEN RETURN NULL; END IF;
  UPDATE public.whatsapp_follow_ups SET reason=left(p_reason,500),decision=coalesce(decision,jsonb_build_object('action','SEND','reason',left(p_reason,500))),
    model=coalesce(p_model,model),input_tokens=coalesce(p_input_tokens,input_tokens),
    output_tokens=coalesce(p_output_tokens,output_tokens),latency_ms=coalesce(p_latency_ms,latency_ms),updated_at=clock_timestamp() WHERE id=f.id;
  UPDATE public.whatsapp_outbox SET status='SENDING',lease_token=p_lease_token,lease_expires_at=clock_timestamp()+interval '60 seconds',
    attempts=attempts+1,updated_at=clock_timestamp() WHERE id=x.id RETURNING * INTO x;
  RETURN to_jsonb(x)||jsonb_build_object('phone_number_id',(SELECT phone_number_id FROM public.whatsapp_integrations WHERE id=f.integration_id),
    'recipient',(SELECT customer_phone FROM public.whatsapp_conversations WHERE id=f.conversation_id));
END $$;

CREATE OR REPLACE FUNCTION public.guard_whatsapp_follow_up_dispatch(p_command_id uuid,p_lease_token uuid,p_phone_number_id text,p_recipient text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.whatsapp_follow_ups%ROWTYPE; x public.whatsapp_outbox%ROWTYPE; v_reason text;
BEGIN
  PERFORM 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_outbox q ON q.conversation_id=c.id
    WHERE q.id=p_command_id AND q.follow_up_id IS NOT NULL FOR UPDATE OF c;
  SELECT q.* INTO f FROM public.whatsapp_follow_ups q JOIN public.whatsapp_outbox o ON o.follow_up_id=q.id WHERE o.id=p_command_id FOR UPDATE OF q;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE id=p_command_id AND follow_up_id=f.id FOR UPDATE;
  IF NOT FOUND OR x.status<>'SENDING' OR p_lease_token IS NULL OR x.lease_token IS DISTINCT FROM p_lease_token
    OR x.lease_expires_at IS NULL OR x.lease_expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  v_reason:=public.whatsapp_follow_up_invalid_reason(f.id);
  IF f.status<>'PROCESSING' OR f.lease_token IS DISTINCT FROM p_lease_token OR f.lease_expires_at<=clock_timestamp() THEN v_reason:=coalesce(v_reason,'CONTROL_CONFLICT'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_integrations wi JOIN public.whatsapp_conversations c ON c.integration_id=wi.id
    WHERE c.id=f.conversation_id AND wi.phone_number_id=p_phone_number_id AND c.customer_phone=p_recipient) THEN v_reason:='CHANNEL_UNAVAILABLE'; END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.whatsapp_follow_ups SET status='CANCELLED',reason=v_reason,updated_at=clock_timestamp() WHERE id=f.id;
    UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code=CASE WHEN v_reason IN ('WINDOW_EXPIRED','CHANNEL_UNAVAILABLE','DELIVERY_UNRESOLVED')
      THEN CASE WHEN v_reason='DELIVERY_UNRESOLVED' THEN 'CONTROL_CONFLICT' ELSE v_reason END ELSE 'CONTROL_CONFLICT' END,
      updated_at=clock_timestamp() WHERE id=x.id;
    RETURN NULL;
  END IF;
  -- The model can finish after closing time. Keep its saved text, and let the
  -- worker defer to the next opening without consuming another model attempt.
  IF NOT public.whatsapp_follow_up_is_open(f.integration_id) THEN
    UPDATE public.whatsapp_outbox SET status='PENDING',available_at=clock_timestamp()+interval '1 minute',
      reason_code=NULL,updated_at=clock_timestamp() WHERE id=x.id;
    UPDATE public.whatsapp_follow_ups SET attempts=greatest(0,attempts-1),reason='OUTSIDE_BUSINESS_HOURS' WHERE id=f.id;
    RETURN NULL;
  END IF;
  RETURN (SELECT last_customer_message_at+interval '24 hours' FROM public.whatsapp_conversations WHERE id=f.conversation_id);
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_delivery_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.follow_up_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- A 429/preflight failure can arrive after disable/pause. It must not revive
  -- a cancelled schedule when the company later enables follow-ups again.
  IF NEW.status='PENDING' AND NOT EXISTS(SELECT 1 FROM public.whatsapp_follow_ups
    WHERE id=NEW.follow_up_id AND status='PROCESSING') THEN
    UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code='CONTROL_CONFLICT',updated_at=clock_timestamp() WHERE id=NEW.id;
    RETURN NEW;
  END IF;
  UPDATE public.whatsapp_follow_ups SET status=CASE NEW.status WHEN 'SENT' THEN 'SENT' WHEN 'UNKNOWN' THEN 'UNKNOWN'
    WHEN 'CANCELLED' THEN CASE WHEN status IN ('SKIPPED','FAILED') THEN status ELSE 'CANCELLED' END WHEN 'PENDING' THEN 'PENDING' ELSE status END,
    available_at=CASE WHEN NEW.status='PENDING' THEN NEW.available_at ELSE available_at END,
    reason=CASE WHEN NEW.status='PENDING' THEN 'PROVIDER_RETRY' WHEN NEW.status='SENDING' THEN reason ELSE coalesce(NEW.reason_code,reason) END,
    updated_at=clock_timestamp() WHERE id=NEW.follow_up_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_follow_up_delivery_result ON public.whatsapp_outbox;
CREATE TRIGGER whatsapp_follow_up_delivery_result AFTER UPDATE OF status ON public.whatsapp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_follow_up_delivery_result();

-- Common finalization keeps uncertain deliveries reviewable through the inbox.
CREATE OR REPLACE FUNCTION public.complete_whatsapp_command(p_command_id uuid,p_lease_token uuid,p_status text,p_external_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE x public.whatsapp_outbox%ROWTYPE; c public.whatsapp_conversations%ROWTYPE; existing public.whatsapp_messages%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('PENDING','SENT','UNKNOWN','CANCELLED','WINDOW_EXPIRED') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  SELECT conv.* INTO c FROM public.whatsapp_conversations conv JOIN public.whatsapp_outbox q ON q.conversation_id=conv.id
    AND q.organization_id=conv.organization_id WHERE q.id=p_command_id FOR UPDATE OF conv;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE id=p_command_id FOR UPDATE;
  IF x.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN RETURN false; END IF;
  IF x.status='SENT' THEN RETURN p_status='SENT' AND x.external_message_id IS NOT DISTINCT FROM p_external_message_id; END IF;
  IF x.status='CANCELLED' AND x.reason_code='WINDOW_EXPIRED' THEN
    RETURN p_status='WINDOW_EXPIRED' AND p_external_message_id IS NULL;
  END IF;
  IF x.status NOT IN ('SENDING','UNKNOWN') OR (x.status='UNKNOWN' AND p_status='PENDING') THEN RETURN false; END IF;
  IF p_status='WINDOW_EXPIRED' AND ((x.origin<>'HUMAN' AND x.follow_up_id IS NULL) OR p_external_message_id IS NOT NULL) THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Resultado de ventana inválido';
  END IF;
  IF p_status='SENT' THEN
    IF coalesce(btrim(p_external_message_id),'')='' THEN RAISE EXCEPTION 'Falta identificador externo'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(x.integration_id::text||p_external_message_id,0));
    SELECT * INTO existing FROM public.whatsapp_messages WHERE external_message_id=p_external_message_id;
    IF FOUND AND (existing.organization_id,existing.conversation_id,existing.integration_id,existing.direction,existing.content)
      IS DISTINCT FROM (x.organization_id,x.conversation_id,x.integration_id,'OUTBOUND'::text,x.text) THEN
      RAISE EXCEPTION 'Identificador externo ya registrado'; END IF;
    INSERT INTO public.whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,payload,delivery_status,sent_at,origin,sender_user_id)
      VALUES(x.organization_id,x.integration_id,x.conversation_id,p_external_message_id,'OUTBOUND','TEXT',x.text,
        jsonb_build_object('provider','META_CLOUD','sourceMessageId',x.source_message_id,'orderPrompt',x.order_prompt,'followUpId',x.follow_up_id),'SENT',clock_timestamp(),x.origin,x.actor_user_id)
      ON CONFLICT(external_message_id) DO NOTHING;
    UPDATE public.whatsapp_conversations SET last_message_at=greatest(last_message_at,clock_timestamp()) WHERE id=c.id;
  END IF;
  UPDATE public.whatsapp_outbox SET status=CASE WHEN p_status='WINDOW_EXPIRED' THEN 'CANCELLED' ELSE p_status END,
    external_message_id=coalesce(p_external_message_id,external_message_id),updated_at=clock_timestamp(),
    reason_code=CASE p_status WHEN 'UNKNOWN' THEN 'DELIVERY_UNKNOWN' WHEN 'WINDOW_EXPIRED' THEN 'WINDOW_EXPIRED' WHEN 'CANCELLED' THEN 'PROVIDER_REJECTED' ELSE NULL END,
    available_at=CASE WHEN p_status='PENDING' THEN clock_timestamp()+make_interval(secs=>least(300,5*(2^attempts)::integer)) ELSE available_at END
    WHERE id=x.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_follow_up_protocol_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT CASE WHEN public.whatsapp_guarded_dispatch_ready() AND public.whatsapp_customer_pricing_ready()
    AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND (proname LIKE '%whatsapp_follow_up%' OR proname='claim_whatsapp_follow_up')
      AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE')))
    THEN 1 ELSE 0 END
$$;
DO $$ DECLARE fn record; BEGIN
  FOR fn IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE '%whatsapp_follow_up%' OR proname IN ('whatsapp_outbox_identity','complete_whatsapp_command')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.sig);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
