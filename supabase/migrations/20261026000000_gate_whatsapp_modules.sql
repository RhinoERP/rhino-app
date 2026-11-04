-- Opt-in rollout: existing and future organizations start with both capabilities hidden.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_sandbox_enabled boolean NOT NULL DEFAULT false;

-- Tenant administrators cannot opt themselves in through the Supabase REST API.
CREATE OR REPLACE FUNCTION public.protect_whatsapp_organization_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.whatsapp_enabled IS NOT DISTINCT FROM OLD.whatsapp_enabled
      AND NEW.whatsapp_sandbox_enabled IS NOT DISTINCT FROM OLD.whatsapp_sandbox_enabled THEN
      RETURN NEW;
    END IF;
  ELSIF NOT NEW.whatsapp_enabled AND NOT NEW.whatsapp_sandbox_enabled THEN
    RETURN NEW;
  END IF;

  IF current_user NOT IN ('postgres', 'supabase_admin')
    AND coalesce(auth.role(), '') <> 'service_role'
    AND NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only platform administrators can change WhatsApp availability'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_whatsapp_organization_flags ON public.organizations;
CREATE TRIGGER protect_whatsapp_organization_flags
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_whatsapp_organization_flags();

CREATE OR REPLACE FUNCTION public.is_whatsapp_mode_enabled(p_organization_id uuid, p_phone_number_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.is_active = true
      AND CASE WHEN p_phone_number_id LIKE 'rhinos-local-simulator:%'
        THEN o.whatsapp_sandbox_enabled ELSE o.whatsapp_enabled END
  );
$$;
REVOKE ALL ON FUNCTION public.is_whatsapp_mode_enabled(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_whatsapp_mode_enabled(uuid, text) TO authenticated, service_role;

-- Restrictive policies supplement membership policies, including direct REST access.
DROP POLICY IF EXISTS whatsapp_integrations_module_gate ON public.whatsapp_integrations;
CREATE POLICY whatsapp_integrations_module_gate ON public.whatsapp_integrations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_whatsapp_mode_enabled(organization_id, phone_number_id))
  WITH CHECK (public.is_whatsapp_mode_enabled(organization_id, phone_number_id)
    AND (phone_number_id NOT LIKE 'rhinos-local-simulator:%' OR status = 'DRAFT'));

DROP POLICY IF EXISTS whatsapp_conversations_module_gate ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_module_gate ON public.whatsapp_conversations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_integrations wi
    WHERE wi.id = integration_id AND wi.organization_id = whatsapp_conversations.organization_id));

DROP POLICY IF EXISTS whatsapp_messages_module_gate ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_module_gate ON public.whatsapp_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_integrations wi
    WHERE wi.id = integration_id AND wi.organization_id = whatsapp_messages.organization_id));

DROP POLICY IF EXISTS agent_jobs_module_gate ON public.agent_jobs;
CREATE POLICY agent_jobs_module_gate ON public.agent_jobs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_integrations wi
    WHERE wi.id = integration_id AND wi.organization_id = agent_jobs.organization_id));

DROP POLICY IF EXISTS agent_runs_module_gate ON public.agent_runs;
CREATE POLICY agent_runs_module_gate ON public.agent_runs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_integrations wi
    WHERE wi.id = integration_id AND wi.organization_id = agent_runs.organization_id));

DROP POLICY IF EXISTS conversation_carts_module_gate ON public.conversation_carts;
CREATE POLICY conversation_carts_module_gate ON public.conversation_carts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id AND wc.organization_id = conversation_carts.organization_id));
DROP POLICY IF EXISTS conversation_cart_items_module_gate ON public.conversation_cart_items;
CREATE POLICY conversation_cart_items_module_gate ON public.conversation_cart_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversation_carts cc
    WHERE cc.id = cart_id AND cc.organization_id = conversation_cart_items.organization_id));

CREATE OR REPLACE FUNCTION public.ingest_whatsapp_inbound_message(
  p_phone_number_id text,
  p_customer_phone text,
  p_external_message_id text,
  p_message_type text,
  p_content text,
  p_payload jsonb,
  p_received_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  message_id uuid,
  conversation_id uuid,
  agent_job_id uuid,
  inserted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_integration public.whatsapp_integrations%ROWTYPE;
  v_conversation public.whatsapp_conversations%ROWTYPE;
  v_message_id uuid;
  v_job_id uuid;
  v_customer_phone text;
BEGIN
  v_customer_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');

  IF length(v_customer_phone) = 0 THEN
    RAISE EXCEPTION 'El teléfono del cliente es obligatorio';
  END IF;

  IF coalesce(btrim(p_external_message_id), '') = '' THEN
    RAISE EXCEPTION 'El identificador externo del mensaje es obligatorio';
  END IF;

  -- Meta reintenta el mismo evento. Devolver el resultado anterior evita que
  -- se cree otra conversación o trabajo, incluso con webhooks concurrentes.
  SELECT m.id, m.conversation_id
  INTO v_message_id, conversation_id
  FROM public.whatsapp_messages m
  WHERE m.external_message_id = p_external_message_id;

  IF FOUND THEN
    SELECT j.id INTO v_job_id
    FROM public.agent_jobs j
    WHERE j.source_message_id = v_message_id;

    message_id := v_message_id;
    agent_job_id := v_job_id;
    inserted := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_integration
  FROM public.whatsapp_integrations wi
  WHERE wi.phone_number_id = p_phone_number_id
    AND wi.status = 'ACTIVE'
    AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    AND public.is_whatsapp_mode_enabled(wi.organization_id, wi.phone_number_id);

  -- Un número no activo se reconoce, pero nunca dispara automatización.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.whatsapp_conversations (
    organization_id,
    integration_id,
    customer_phone,
    last_message_at
  ) VALUES (
    v_integration.organization_id,
    v_integration.id,
    v_customer_phone,
    p_received_at
  )
  ON CONFLICT (integration_id, customer_phone)
  DO UPDATE SET last_message_at = greatest(
    coalesce(public.whatsapp_conversations.last_message_at, '-infinity'::timestamptz),
    excluded.last_message_at
  )
  RETURNING * INTO v_conversation;

  INSERT INTO public.whatsapp_messages (
    organization_id,
    integration_id,
    conversation_id,
    external_message_id,
    direction,
    message_type,
    content,
    payload,
    delivery_status,
    sent_at
  ) VALUES (
    v_integration.organization_id,
    v_integration.id,
    v_conversation.id,
    p_external_message_id,
    'INBOUND',
    p_message_type,
    p_content,
    coalesce(p_payload, '{}'::jsonb),
    'RECEIVED',
    p_received_at
  )
  ON CONFLICT (external_message_id) DO NOTHING
  RETURNING id INTO v_message_id;

  -- Una inserción concurrente puede haber ganado luego de la consulta inicial.
  IF v_message_id IS NULL THEN
    SELECT m.id, m.conversation_id INTO v_message_id, conversation_id
    FROM public.whatsapp_messages m
    WHERE m.external_message_id = p_external_message_id;

    SELECT j.id INTO v_job_id
    FROM public.agent_jobs j
    WHERE j.source_message_id = v_message_id;

    message_id := v_message_id;
    agent_job_id := v_job_id;
    inserted := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.agent_jobs (
    organization_id,
    integration_id,
    conversation_id,
    source_message_id
  ) VALUES (
    v_integration.organization_id,
    v_integration.id,
    v_conversation.id,
    v_message_id
  )
  RETURNING id INTO v_job_id;

  message_id := v_message_id;
  conversation_id := v_conversation.id;
  agent_job_id := v_job_id;
  inserted := true;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_agent_job(p_worker_id text)
RETURNS SETOF public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.agent_jobs%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_worker_id), '') = '' THEN
    RAISE EXCEPTION 'El identificador del worker es obligatorio';
  END IF;

  SELECT j.* INTO v_job
  FROM public.agent_jobs j
  JOIN public.whatsapp_integrations wi ON wi.id = j.integration_id
  JOIN public.whatsapp_conversations wc ON wc.id = j.conversation_id
  WHERE (
      (j.status IN ('PENDING', 'RETRY') AND j.available_at <= now())
      OR (j.status = 'PROCESSING' AND j.locked_at < now() - interval '15 minutes')
    )
    AND wi.status = 'ACTIVE'
    AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    AND public.is_whatsapp_mode_enabled(wi.organization_id, wi.phone_number_id)
    AND wc.status = 'ACTIVE'
  ORDER BY j.available_at, j.created_at
  FOR UPDATE OF j SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.agent_jobs
  SET status = 'PROCESSING',
      attempts = v_job.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      last_error = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_whatsapp_outbound_message(
  p_conversation_id uuid,
  p_integration_id uuid,
  p_external_message_id text,
  p_message_type text,
  p_content text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id uuid;
BEGIN
  INSERT INTO public.whatsapp_messages (
    organization_id, integration_id, conversation_id, external_message_id,
    direction, message_type, content, payload, delivery_status, sent_at
  )
  SELECT wc.organization_id, wc.integration_id, wc.id, p_external_message_id,
    'OUTBOUND', p_message_type, p_content, coalesce(p_payload, '{}'::jsonb), 'SENT', now()
  FROM public.whatsapp_conversations wc
  JOIN public.whatsapp_integrations wi ON wi.id = wc.integration_id
  WHERE wc.id = p_conversation_id
    AND wc.integration_id = p_integration_id
    AND wc.status IN ('ACTIVE', 'PAUSED', 'HANDOFF')
    AND wi.status = 'ACTIVE'
    AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    AND public.is_whatsapp_mode_enabled(wi.organization_id, wi.phone_number_id)
  ON CONFLICT (external_message_id) DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    SELECT id INTO v_message_id
    FROM public.whatsapp_messages
    WHERE external_message_id = p_external_message_id
      AND direction = 'OUTBOUND';
  END IF;

  IF v_message_id IS NULL THEN
    RAISE EXCEPTION 'No se puede enviar a una conversación o integración inactiva';
  END IF;

  RETURN v_message_id;
END;
$$;
