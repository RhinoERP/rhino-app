-- Canal de WhatsApp: las operaciones expuestas al webhook y al worker se
-- ejecutan como transacciones en la base. Esto evita la ventana entre guardar
-- un mensaje y crear su trabajo de agente.

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
    AND wi.status = 'ACTIVE';

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

CREATE OR REPLACE FUNCTION public.finish_whatsapp_agent_job(
  p_job_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_error text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT 0
)
RETURNS public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job
  FROM public.agent_jobs
  WHERE id = p_job_id
    AND status = 'PROCESSING'
    AND locked_by = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El trabajo no está reclamado por este worker';
  END IF;

  IF p_succeeded THEN
    UPDATE public.agent_jobs
    SET status = 'SUCCEEDED', completed_at = now(), locked_at = NULL, locked_by = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  ELSIF v_job.attempts >= v_job.max_attempts THEN
    UPDATE public.agent_jobs
    SET status = 'FAILED', completed_at = now(), last_error = left(coalesce(p_error, 'Error desconocido'), 2000),
        locked_at = NULL, locked_by = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  ELSE
    UPDATE public.agent_jobs
    SET status = 'RETRY', available_at = now() + make_interval(secs => greatest(p_retry_after_seconds, 1)),
        last_error = left(coalesce(p_error, 'Error transitorio'), 2000), locked_at = NULL, locked_by = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_whatsapp_delivery_status(
  p_external_message_id text,
  p_delivery_status text,
  p_status_at timestamptz DEFAULT now(),
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_delivery_status NOT IN ('SENT', 'DELIVERED', 'READ', 'FAILED') THEN
    RAISE EXCEPTION 'Estado de entrega inválido';
  END IF;

  UPDATE public.whatsapp_messages
  SET delivery_status = p_delivery_status,
      sent_at = CASE WHEN p_delivery_status = 'SENT' THEN p_status_at ELSE sent_at END,
      payload = coalesce(payload, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb)
  WHERE external_message_id = p_external_message_id
    AND direction = 'OUTBOUND';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
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
    AND wc.status = 'ACTIVE'
    AND wi.status = 'ACTIVE'
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

REVOKE ALL ON FUNCTION public.ingest_whatsapp_inbound_message(text, text, text, text, text, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_whatsapp_agent_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_whatsapp_agent_job(uuid, text, boolean, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_whatsapp_delivery_status(text, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_whatsapp_outbound_message(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ingest_whatsapp_inbound_message(text, text, text, text, text, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_agent_job(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_whatsapp_agent_job(uuid, text, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_delivery_status(text, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_outbound_message(uuid, uuid, text, text, text, jsonb) TO service_role;
