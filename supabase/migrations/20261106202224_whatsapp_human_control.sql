-- Phase 1: human control only. Human delivery remains disabled until the common
-- outbox is installed. No tenant flags, carts, messages or jobs are deleted.
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS control_version integer NOT NULL DEFAULT 0 CHECK (control_version >= 0),
  ADD COLUMN IF NOT EXISTS human_claimed_at timestamptz;
ALTER TABLE public.whatsapp_conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_human_claim_check;
ALTER TABLE public.whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_human_claim_check
  CHECK (human_claimed_at IS NULL OR (status = 'HANDOFF' AND assigned_user_id IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('HANDOFF','CLAIM','TRANSFER','PAUSE','RESUME')),
  actor_user_id uuid REFERENCES auth.users(id),
  assigned_user_id uuid REFERENCES auth.users(id),
  control_version integer NOT NULL,
  reason text CHECK (length(reason) <= 1000),
  source_message_id uuid REFERENCES public.whatsapp_messages(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.whatsapp_conversations(id, organization_id) ON DELETE CASCADE,
  UNIQUE (conversation_id, control_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversation_handoff_source_key
  ON public.whatsapp_conversation_events(conversation_id, source_message_id) WHERE type = 'HANDOFF';

-- Same RBAC source as the ERP: active membership, owner or a tenant-bound role.
-- This helper accepts an actor only because it is service-only, never a browser RPC.
CREATE OR REPLACE FUNCTION public.whatsapp_actor_can_manage(p_organization_id uuid, p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id AND m.user_id = p_actor_id AND m.is_active
      AND (m.is_owner OR EXISTS (
        SELECT 1 FROM public.roles r
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE r.id = m.role_id AND r.organization_id = m.organization_id
          AND p.key IN ('whatsapp.manage', 'organization.admin')
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_conversation_control_state(p_organization_id uuid, p_conversation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'status', c.status, 'assignedUserId', c.assigned_user_id,
    'humanClaimedAt', c.human_claimed_at, 'controlVersion', c.control_version,
    'deliveryBlock', (SELECT x.status FROM public.whatsapp_outbox x
      WHERE x.organization_id = c.organization_id AND x.conversation_id = c.id
        AND x.status IN ('SENDING','UNKNOWN') ORDER BY x.status = 'UNKNOWN' DESC LIMIT 1)
  ) FROM public.whatsapp_conversations c
  WHERE c.organization_id = p_organization_id AND c.id = p_conversation_id
$$;

CREATE OR REPLACE FUNCTION public.list_whatsapp_control_operators(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.user_id,
    'name', coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Integrante del equipo')) ORDER BY m.user_id),'[]'::jsonb)
  FROM public.organization_members m JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_organization_id AND public.whatsapp_actor_can_manage(m.organization_id,m.user_id)
$$;

CREATE OR REPLACE FUNCTION public.control_whatsapp_conversation(
  p_organization_id uuid, p_conversation_id uuid, p_actor_id uuid,
  p_expected_control_version integer, p_operation text, p_assigned_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; phone text;
BEGIN
  IF NOT public.whatsapp_actor_can_manage(p_organization_id, p_actor_id) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'Se requiere whatsapp.manage y membresía activa';
  END IF;
  IF p_expected_control_version IS NULL OR p_expected_control_version < 0
    OR p_operation IS NULL OR p_operation NOT IN ('CLAIM','TRANSFER','PAUSE','RESUME') THEN
    RAISE SQLSTATE '22023' USING MESSAGE = 'Operación de control inválida';
  END IF;
  -- Never lock jobs here: workers lock job -> conversation -> outbox.
  SELECT * INTO c FROM public.whatsapp_conversations
    WHERE id = p_conversation_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE '42501' USING MESSAGE = 'Conversación no disponible'; END IF;
  SELECT phone_number_id INTO phone FROM public.whatsapp_integrations
    WHERE id = c.integration_id AND organization_id = c.organization_id;
  IF phone IS NULL OR NOT public.is_whatsapp_mode_enabled(p_organization_id, phone) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'El módulo no está habilitado';
  END IF;
  IF c.control_version <> p_expected_control_version THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'control',
      public.whatsapp_conversation_control_state(c.organization_id, c.id));
  END IF;
  IF c.status = 'CLOSED' OR (p_operation = 'TRANSFER' AND c.status <> 'HANDOFF') THEN
    RAISE SQLSTATE '22023' USING MESSAGE = 'La conversación no admite esta operación';
  END IF;
  IF p_operation = 'CLAIM' AND c.human_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT', 'control',
      public.whatsapp_conversation_control_state(c.organization_id, c.id));
  END IF;
  IF p_operation = 'TRANSFER' AND NOT public.whatsapp_actor_can_manage(p_organization_id, p_assigned_user_id) THEN
    RAISE SQLSTATE '22023' USING MESSAGE = 'El destinatario necesita membresía activa y whatsapp.manage';
  END IF;
  IF p_operation = 'RESUME' AND EXISTS (
    SELECT 1 FROM public.whatsapp_outbox WHERE conversation_id = c.id
      AND organization_id = c.organization_id AND status IN ('SENDING','UNKNOWN')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'DELIVERY_UNRESOLVED', 'control',
      public.whatsapp_conversation_control_state(c.organization_id, c.id));
  END IF;
  IF (p_operation = 'RESUME' AND c.status = 'ACTIVE')
    OR (p_operation = 'PAUSE' AND c.status = 'PAUSED')
    OR (p_operation = 'TRANSFER' AND c.assigned_user_id = p_assigned_user_id) THEN
    RETURN jsonb_build_object('success', true, 'control',
      public.whatsapp_conversation_control_state(c.organization_id, c.id));
  END IF;
  UPDATE public.whatsapp_conversations SET
    status = CASE p_operation WHEN 'RESUME' THEN 'ACTIVE' WHEN 'PAUSE' THEN 'PAUSED' ELSE 'HANDOFF' END,
    assigned_user_id = CASE p_operation WHEN 'CLAIM' THEN p_actor_id WHEN 'TRANSFER' THEN p_assigned_user_id WHEN 'RESUME' THEN NULL ELSE assigned_user_id END,
    human_claimed_at = CASE p_operation WHEN 'CLAIM' THEN clock_timestamp() WHEN 'TRANSFER' THEN human_claimed_at ELSE NULL END,
    control_version = control_version + 1,
    pending_order_action = NULL,
    bot_paused_at = CASE WHEN p_operation = 'RESUME' THEN NULL ELSE coalesce(bot_paused_at, clock_timestamp()) END,
    bot_paused_by = CASE WHEN p_operation = 'RESUME' THEN NULL ELSE p_actor_id END,
    handoff_reason = CASE WHEN p_operation = 'RESUME' THEN NULL ELSE handoff_reason END,
    automation_resumed_at = CASE WHEN p_operation = 'RESUME' THEN clock_timestamp() ELSE automation_resumed_at END
  WHERE id = c.id RETURNING * INTO c;
  UPDATE public.whatsapp_outbox SET status = 'CANCELLED', updated_at = clock_timestamp()
    WHERE conversation_id = c.id AND organization_id = c.organization_id AND status = 'PENDING';
  INSERT INTO public.whatsapp_conversation_events(organization_id, conversation_id, type, actor_user_id, assigned_user_id, control_version)
    VALUES(c.organization_id, c.id, p_operation, p_actor_id, c.assigned_user_id, c.control_version);
  RETURN jsonb_build_object('success', true, 'control',
    public.whatsapp_conversation_control_state(c.organization_id, c.id));
END $$;

-- Keep the old signature fail-closed for old applications: a server-side read of
-- the current version cannot stand in for the operator's expected version.
CREATE OR REPLACE FUNCTION public.set_whatsapp_automation(p_organization_id uuid,p_conversation_id uuid,p_enabled boolean,p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.whatsapp_actor_can_manage(p_organization_id, p_actor_id) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'Se requiere whatsapp.manage y membresía activa';
  END IF;
  RAISE SQLSTATE '22023' USING MESSAGE = 'Usá control_whatsapp_conversation con la versión esperada';
END $$;

-- Both leased and non-leased handoffs converge here, with one event per source.
CREATE OR REPLACE FUNCTION public.handoff_whatsapp_conversation(
  p_organization_id uuid, p_integration_id uuid, p_conversation_id uuid,
  p_source_message_id uuid, p_reason text, p_job_id uuid DEFAULT NULL, p_lease_token uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.whatsapp_conversations%ROWTYPE; j public.agent_jobs%ROWTYPE; recipient uuid;
BEGIN
  IF p_job_id IS NOT NULL THEN
    j := public.lock_whatsapp_job_lease(p_job_id, p_lease_token, 'PROCESS_CONVERSATION');
    IF (j.organization_id,j.integration_id,j.conversation_id,j.source_message_id)
      IS DISTINCT FROM (p_organization_id,p_integration_id,p_conversation_id,p_source_message_id) THEN
      RAISE EXCEPTION 'El trabajo no pertenece a esta conversación';
    END IF;
  END IF;
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id = p_conversation_id
    AND organization_id = p_organization_id AND integration_id = p_integration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no disponible'; END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_conversation_events WHERE conversation_id = c.id
    AND type = 'HANDOFF' AND source_message_id = p_source_message_id) THEN
    RETURN jsonb_build_object('handedOff', true);
  END IF;
  IF coalesce(length(btrim(p_reason)),0) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Motivo inválido'; END IF;
  -- Reuse tenant/flag/source/resume fencing; retains the conversation lock.
  PERFORM public.mutate_whatsapp_order(p_organization_id,p_integration_id,p_conversation_id,
    p_source_message_id,'CANCEL_ACTION');
  SELECT responsible_user_id INTO recipient FROM public.whatsapp_integrations WHERE id = p_integration_id;
  IF NOT public.whatsapp_actor_can_manage(p_organization_id, recipient) THEN recipient := NULL; END IF;
  UPDATE public.whatsapp_conversations SET status = 'HANDOFF', human_claimed_at = NULL,
    control_version = control_version + 1, handoff_reason = left(btrim(p_reason),1000),
    bot_paused_at = clock_timestamp(), bot_paused_by = NULL, assigned_user_id = recipient
    WHERE id = c.id RETURNING * INTO c;
  INSERT INTO public.whatsapp_conversation_events(organization_id,conversation_id,type,assigned_user_id,control_version,reason,source_message_id)
    VALUES(c.organization_id,c.id,'HANDOFF',recipient,c.control_version,c.handoff_reason,p_source_message_id);
  RETURN jsonb_build_object('handedOff',true);
END $$;

CREATE OR REPLACE FUNCTION public.mutate_whatsapp_order_leased(
  p_job_id uuid,p_lease_token uuid,p_organization_id uuid,p_integration_id uuid,
  p_conversation_id uuid,p_source_message_id uuid,p_operation text,
  p_cart_id uuid DEFAULT null,p_version integer DEFAULT null,p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.agent_jobs%ROWTYPE;
BEGIN
  IF p_operation = 'HANDOFF' THEN
    RETURN public.handoff_whatsapp_conversation(p_organization_id,p_integration_id,p_conversation_id,
      p_source_message_id,p_payload->>'reason',p_job_id,p_lease_token);
  END IF;
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  IF (j.organization_id,j.integration_id,j.conversation_id,j.source_message_id)
    IS DISTINCT FROM (p_organization_id,p_integration_id,p_conversation_id,p_source_message_id) THEN
    RAISE EXCEPTION 'El trabajo no pertenece a esta conversación';
  END IF;
  RETURN public.mutate_whatsapp_order(p_organization_id,p_integration_id,p_conversation_id,
    p_source_message_id,p_operation,p_cart_id,p_version,p_payload);
END $$;

-- Retain the v2 lease/outbox ABI. Handoff permission is an episode/source,
-- never an equality comparison against a configurable message body.
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
        AND other.source_message_id <> j.source_message_id AND other.status IN ('SENDING','UNKNOWN'))
      OR NOT EXISTS (SELECT 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_integrations wi
        ON wi.id = c.integration_id AND wi.organization_id = c.organization_id
        WHERE c.id = j.conversation_id AND wi.id = j.integration_id AND wi.status = 'ACTIVE'
          AND public.is_whatsapp_mode_enabled(j.organization_id,wi.phone_number_id)
          AND (c.automation_resumed_at IS NULL OR (SELECT created_at FROM public.whatsapp_messages WHERE id = j.source_message_id) > c.automation_resumed_at)
          AND (c.status = 'ACTIVE' OR (c.status = 'HANDOFF' AND c.human_claimed_at IS NULL AND NOT x.order_prompt
            AND EXISTS (SELECT 1 FROM public.whatsapp_conversation_events e WHERE e.conversation_id = c.id
              AND e.control_version = c.control_version AND e.type = 'HANDOFF' AND e.source_message_id = j.source_message_id)))) THEN
      UPDATE public.whatsapp_outbox SET status = 'CANCELLED',updated_at = clock_timestamp()
        WHERE source_message_id = j.source_message_id RETURNING * INTO x;
    ELSE
      UPDATE public.whatsapp_outbox SET status = 'SENDING',lease_token = p_lease_token,updated_at = clock_timestamp(),
        text = CASE WHEN (SELECT status FROM public.whatsapp_conversations WHERE id=j.conversation_id)='HANDOFF'
          THEN coalesce((SELECT handoff_message FROM public.whatsapp_integrations WHERE id=j.integration_id),
            'Una persona del equipo comercial va a continuar la atención por este chat.') ELSE text END
        WHERE source_message_id = j.source_message_id RETURNING * INTO x;
    END IF;
  END IF;
  RETURN to_jsonb(x);
END $$;

CREATE OR REPLACE FUNCTION public.assert_whatsapp_job_lease(p_job_id uuid,p_lease_token uuid,p_conversation_id uuid,p_source_message_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.agent_jobs j
    JOIN public.whatsapp_conversations c ON c.id = j.conversation_id AND c.organization_id = j.organization_id
    JOIN public.whatsapp_messages m ON m.id = j.source_message_id
    WHERE j.id = p_job_id AND j.lease_token = p_lease_token AND j.conversation_id = p_conversation_id AND j.source_message_id = p_source_message_id
      AND j.job_type = 'PROCESS_CONVERSATION' AND j.status = 'PROCESSING' AND j.lease_expires_at > clock_timestamp()
      AND c.human_claimed_at IS NULL AND (c.automation_resumed_at IS NULL OR m.created_at > c.automation_resumed_at)
      AND (c.status = 'ACTIVE' OR (c.status = 'HANDOFF' AND EXISTS (
        SELECT 1 FROM public.whatsapp_conversation_events e WHERE e.conversation_id = c.id
          AND e.control_version = c.control_version AND e.type = 'HANDOFF' AND e.source_message_id = m.id))))
$$;

-- Do not reclaim sources from before the explicit return to automation.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_job_v2(p_worker_id text,p_job_type text,p_execution_mode text DEFAULT 'DAEMON',p_job_id uuid DEFAULT null,p_capacity integer DEFAULT 8)
RETURNS SETOF public.agent_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j agent_jobs%ROWTYPE; v_sim boolean;
BEGIN
  IF coalesce(btrim(p_worker_id),'')='' OR p_job_type NOT IN ('TRANSCRIBE_AUDIO','PROCESS_CONVERSATION') OR p_execution_mode NOT IN ('INLINE','DAEMON') THEN RAISE EXCEPTION 'Configuración de worker inválida'; END IF;
  -- Serialize admission briefly; no database transaction spans a provider request.
  PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp-claim-'||p_job_type,0));
  IF (SELECT count(*) FROM agent_jobs WHERE job_type=p_job_type AND status='PROCESSING' AND lease_expires_at>clock_timestamp()) >= greatest(1,least(p_capacity,32)) THEN RETURN; END IF;
  FOR j IN SELECT q.* FROM agent_jobs q
    JOIN whatsapp_integrations wi ON wi.id=q.integration_id AND wi.organization_id=q.organization_id
    JOIN whatsapp_conversations c ON c.id=q.conversation_id AND c.organization_id=q.organization_id
    JOIN organizations o ON o.id=q.organization_id
    WHERE q.job_type=p_job_type AND q.execution_mode=p_execution_mode AND (p_job_id IS NULL OR q.id=p_job_id)
      AND ((q.status IN ('PENDING','RETRY') AND q.available_at<=now()) OR (q.status='PROCESSING' AND q.lease_expires_at<=clock_timestamp()))
      AND o.is_active AND c.status='ACTIVE' AND c.human_claimed_at IS NULL
      AND (c.automation_resumed_at IS NULL OR (SELECT m.created_at FROM public.whatsapp_messages m WHERE m.id=q.source_message_id)>c.automation_resumed_at)
      AND public.is_whatsapp_mode_enabled(o.id,wi.phone_number_id)
      AND ((wi.phone_number_id LIKE 'rhinos-local-simulator:%' AND wi.status='DRAFT') OR wi.status='ACTIVE')
      AND (p_job_type<>'TRANSCRIBE_AUDIO' OR CASE WHEN wi.phone_number_id LIKE 'rhinos-local-simulator:%' THEN o.whatsapp_sandbox_audio_enabled ELSE o.whatsapp_audio_enabled END)
      AND NOT EXISTS(SELECT 1 FROM whatsapp_outbox x WHERE x.conversation_id=q.conversation_id AND (x.status='UNKNOWN' OR (x.status='SENDING' AND x.source_message_id<>q.source_message_id)))
      AND (p_job_type<>'TRANSCRIBE_AUDIO' OR NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets a WHERE a.message_id=q.source_message_id AND a.status<>'SUCCEEDED' AND a.expires_at<=clock_timestamp()))
      -- Filter blocked conversations before LIMIT: a busy chat must not hide
      -- eligible work for other tenants behind the first 50 candidates.
      AND (p_job_type<>'PROCESS_CONVERSATION' OR (
        NOT EXISTS(SELECT 1 FROM agent_jobs active WHERE active.conversation_id=q.conversation_id AND active.job_type='PROCESS_CONVERSATION' AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>q.id)
        AND NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets a JOIN whatsapp_messages m ON m.id=a.message_id JOIN whatsapp_messages src ON src.id=q.source_message_id
          WHERE a.conversation_id=q.conversation_id AND (m.created_at,m.id)<=(src.created_at,src.id) AND a.status IN ('PENDING','PROCESSING'))
      ))
      AND NOT EXISTS(SELECT 1 FROM agent_jobs active WHERE active.organization_id=q.organization_id AND active.job_type=p_job_type AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>q.id GROUP BY active.organization_id HAVING count(*)>=2)
    ORDER BY q.available_at,q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 50
  LOOP
    IF p_job_type='PROCESS_CONVERSATION' THEN
      IF NOT pg_try_advisory_xact_lock(hashtextextended(j.conversation_id::text,0)) THEN CONTINUE; END IF;
      IF EXISTS(SELECT 1 FROM agent_jobs active WHERE active.conversation_id=j.conversation_id AND active.job_type='PROCESS_CONVERSATION' AND active.status='PROCESSING' AND active.lease_expires_at>clock_timestamp() AND active.id<>j.id) THEN CONTINUE; END IF;
      IF EXISTS(SELECT 1 FROM whatsapp_audio_assets a JOIN whatsapp_messages m ON m.id=a.message_id JOIN whatsapp_messages src ON src.id=j.source_message_id
        WHERE a.conversation_id=j.conversation_id AND (m.created_at,m.id)<=(src.created_at,src.id) AND a.status IN ('PENDING','PROCESSING')) THEN CONTINUE; END IF;
    END IF;
    -- The candidate query can predate a claim waiting on this same row.
    PERFORM 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_messages m ON m.id=j.source_message_id
      WHERE c.id=j.conversation_id AND c.organization_id=j.organization_id AND c.status='ACTIVE'
        AND c.human_claimed_at IS NULL AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at)
      FOR UPDATE OF c;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE agent_jobs SET status='PROCESSING',attempts=attempts+1,locked_at=now(),locked_by=p_worker_id,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '180 seconds',last_error=null WHERE id=j.id RETURNING * INTO j;
    RETURN NEXT j; RETURN;
  END LOOP;
END $$;


-- Apply the same acceptance fence to sandbox output without changing audio jobs.
CREATE OR REPLACE FUNCTION public.record_whatsapp_simulation_outbound(
  p_job_id uuid,p_lease_token uuid,p_text text,p_order_prompt boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.agent_jobs%ROWTYPE; message_id uuid;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  IF j.execution_mode <> 'INLINE' OR NOT EXISTS (SELECT 1 FROM public.whatsapp_integrations
    WHERE id = j.integration_id AND organization_id = j.organization_id
      AND phone_number_id LIKE 'rhinos-local-simulator:%' AND status = 'DRAFT'
      AND public.is_whatsapp_mode_enabled(j.organization_id,phone_number_id))
    OR NOT EXISTS (SELECT 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_messages m ON m.id = j.source_message_id
      WHERE c.id = j.conversation_id AND (c.status = 'ACTIVE' OR (c.status = 'HANDOFF' AND c.human_claimed_at IS NULL
        AND NOT p_order_prompt AND EXISTS (SELECT 1 FROM public.whatsapp_conversation_events e WHERE e.conversation_id = c.id
          AND e.control_version = c.control_version AND e.type = 'HANDOFF' AND e.source_message_id = j.source_message_id)))
        AND (c.automation_resumed_at IS NULL OR m.created_at > c.automation_resumed_at)) THEN
    RAISE EXCEPTION 'La sesión no está disponible';
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_messages m JOIN public.whatsapp_messages src ON src.id = j.source_message_id
    WHERE m.conversation_id = j.conversation_id AND m.direction = 'INBOUND'
      AND (m.created_at,m.id) > (src.created_at,src.id)) THEN RAISE EXCEPTION 'El mensaje fue reemplazado'; END IF;
  INSERT INTO public.whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,payload,delivery_status)
    VALUES(j.organization_id,j.integration_id,j.conversation_id,'local-simulator-response:'||j.source_message_id,'OUTBOUND','TEXT',p_text,
      jsonb_build_object('source','LOCAL_SIMULATOR','sentToWhatsApp',false,'sourceMessageId',j.source_message_id,'orderPrompt',p_order_prompt),'FAILED')
    ON CONFLICT(external_message_id) DO NOTHING RETURNING id INTO message_id;
  IF message_id IS NULL THEN SELECT id INTO message_id FROM public.whatsapp_messages WHERE external_message_id = 'local-simulator-response:'||j.source_message_id; END IF;
  UPDATE public.whatsapp_conversations SET last_message_at = now() WHERE id = j.conversation_id;
  RETURN message_id;
END $$;

-- Internal tables are server-only: membership RLS alone exposed payloads and
-- allowed control writes. Remove both grants (including column grants) and policies.
DO $$ DECLARE t record; col record; policy record; fn record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND (tablename LIKE 'whatsapp\_%' ESCAPE '\' OR tablename IN ('conversation_carts','conversation_cart_items','agent_jobs','agent_runs'))
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t.tablename);
    FOR col IN SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.tablename LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',col.column_name,t.tablename);
    END LOOP;
    FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',policy.policyname,t.tablename);
    END LOOP;
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t.tablename);
  END LOOP;
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'whatsapp_actor_can_manage','whatsapp_conversation_control_state','list_whatsapp_control_operators','control_whatsapp_conversation',
      'handoff_whatsapp_conversation','set_whatsapp_automation','mutate_whatsapp_order_leased',
      'prepare_whatsapp_outbox','record_whatsapp_simulation_outbound')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
