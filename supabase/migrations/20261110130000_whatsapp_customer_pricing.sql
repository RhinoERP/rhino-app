ALTER TABLE public.whatsapp_integrations
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN IF NOT EXISTS allow_general_for_customers boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_integrations
  DROP CONSTRAINT IF EXISTS whatsapp_integrations_active_config_check,
  DROP CONSTRAINT IF EXISTS whatsapp_integrations_pricing_mode_check;
ALTER TABLE public.whatsapp_integrations
  ADD CONSTRAINT whatsapp_integrations_pricing_mode_check
    CHECK (pricing_mode IN ('SINGLE','CUSTOMER_OR_GENERAL','REGISTERED_ONLY')),
  ADD CONSTRAINT whatsapp_integrations_active_config_check CHECK (
    status <> 'ACTIVE' OR (responsible_user_id IS NOT NULL AND
      (sales_price_list_id IS NOT NULL OR
        (pricing_mode = 'REGISTERED_ONLY' AND NOT allow_general_for_customers)))
  );

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS pricing_context_key text,
  ADD COLUMN IF NOT EXISTS pricing_context_since timestamptz,
  ADD COLUMN IF NOT EXISTS customer_linked_at timestamptz;
ALTER TABLE public.whatsapp_outbox ADD COLUMN IF NOT EXISTS pricing_context_key text;

-- Compare full international numbers. Argentina's domestic mobile 0...15
-- notation is accepted only when the area-code split is unambiguous.
CREATE OR REPLACE FUNCTION public.whatsapp_phone_key(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  digits text := regexp_replace(btrim(p_phone), '[^0-9]', '', 'g');
  candidate text;
  mobile text;
BEGIN
  IF btrim(p_phone) !~ '^\+?[0-9 ()\-./]+$' THEN RETURN NULL; END IF;
  IF digits LIKE '00%' THEN digits := substr(digits,3); END IF;
  IF digits ~ '^0[1-9][0-9]{11}$' THEN
    FOR area_length IN 2..4 LOOP
      IF substr(digits,area_length+2,2) = '15' THEN
        candidate := '549' || substr(digits,2,area_length) || substr(digits,area_length+4);
        IF mobile IS NOT NULL THEN RETURN NULL; END IF;
        mobile := candidate;
      END IF;
    END LOOP;
    RETURN mobile;
  END IF;
  IF digits ~ '^0[1-9][0-9]{9}$' THEN RETURN '54' || substr(digits,2); END IF;
  IF digits ~ '^[1-9][0-9]{7,14}$' THEN RETURN digits; END IF;
  RETURN NULL;
END $$;

CREATE INDEX IF NOT EXISTS customers_whatsapp_phone_key_idx
  ON public.customers (organization_id, public.whatsapp_phone_key(phone)) WHERE is_active;

CREATE OR REPLACE FUNCTION public.whatsapp_customer_candidates(p_org uuid,p_phone text)
RETURNS TABLE (id uuid, business_name text, fantasy_name text, sales_price_list_id uuid)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT c.id,c.business_name,c.fantasy_name,c.sales_price_list_id
  FROM public.customers c
  WHERE c.organization_id=p_org AND c.is_active
    AND public.whatsapp_phone_key(c.phone)=public.whatsapp_phone_key(p_phone)
  ORDER BY c.id LIMIT 2
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_pricing_context(p_org uuid,p_integration uuid,p_chat uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  config public.whatsapp_integrations%ROWTYPE;
  chat public.whatsapp_conversations%ROWTYPE;
  matching uuid[];
  customer_list uuid;
  customer_id uuid;
  list_id uuid;
  reason text;
BEGIN
  SELECT * INTO chat FROM public.whatsapp_conversations
    WHERE (id,organization_id,integration_id)=(p_chat,p_org,p_integration);
  SELECT * INTO config FROM public.whatsapp_integrations
    WHERE (id,organization_id)=(p_integration,p_org);
  IF chat.id IS NULL OR config.id IS NULL THEN RAISE EXCEPTION 'Conversación inválida'; END IF;
  IF config.pricing_mode='SINGLE' OR config.phone_number_id LIKE 'rhinos-local-simulator:%' THEN
    RETURN jsonb_build_object('mode','SINGLE','listId',config.sales_price_list_id,'customerId',chat.customer_id);
  END IF;

  SELECT array_agg(m.id) INTO matching FROM public.whatsapp_customer_candidates(p_org,chat.customer_phone) m;
  IF cardinality(matching)>1 THEN
    reason := 'AMBIGUOUS_PHONE';
  ELSIF cardinality(matching)=1 THEN
    customer_id := matching[1];
    SELECT c.sales_price_list_id INTO customer_list FROM public.customers c WHERE c.id=customer_id AND c.organization_id=p_org;
    list_id := customer_list;
    IF list_id IS NULL AND config.allow_general_for_customers THEN list_id := config.sales_price_list_id; END IF;
    IF list_id IS NULL THEN reason := 'CUSTOMER_WITHOUT_LIST'; END IF;
  ELSIF config.pricing_mode='REGISTERED_ONLY' THEN
    reason := 'UNREGISTERED';
  ELSE
    list_id := config.sales_price_list_id;
  END IF;

  IF reason IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales_price_lists s WHERE (s.id,s.organization_id)=(list_id,p_org)
      AND s.is_active AND (s.valid_from IS NULL OR s.valid_from <= (statement_timestamp() AT TIME ZONE 'UTC')::date)
  ) THEN
    reason := 'LIST_UNAVAILABLE';
    list_id := NULL;
  END IF;

  RETURN jsonb_build_object('mode',config.pricing_mode,'customerId',customer_id,'listId',list_id,'reason',reason,
    'key',md5(jsonb_build_array(config.pricing_mode,customer_id,list_id,reason)::text));
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_job_pricing(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  job public.agent_jobs%ROWTYPE;
  chat public.whatsapp_conversations%ROWTYPE;
  pricing jsonb;
  source_at timestamptz;
  context_since timestamptz;
BEGIN
  job := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  SELECT * INTO chat FROM public.whatsapp_conversations WHERE id=job.conversation_id FOR UPDATE;
  SELECT created_at INTO source_at FROM public.whatsapp_messages WHERE id=job.source_message_id;
  pricing := public.whatsapp_pricing_context(job.organization_id,job.integration_id,chat.id);
  IF chat.customer_linked_at >= source_at THEN
    pricing := pricing || jsonb_build_object('reason','LINKED_AFTER_MESSAGE');
  END IF;
  UPDATE public.whatsapp_outbox SET status='CANCELLED',updated_at=clock_timestamp()
    WHERE source_message_id=job.source_message_id AND status='PENDING'
      AND (pricing_context_key IS DISTINCT FROM pricing->>'key' OR pricing->>'reason' IS NOT NULL);
  IF pricing->>'reason'='LINKED_AFTER_MESSAGE' THEN RETURN pricing; END IF;

  context_since := chat.pricing_context_since;
  IF chat.pricing_context_key IS DISTINCT FROM pricing->>'key' THEN
    context_since := clock_timestamp();
    UPDATE public.whatsapp_conversations SET pricing_context_key=pricing->>'key',
      pricing_context_since=context_since,pending_order_action=NULL WHERE id=chat.id;
    UPDATE public.conversation_carts SET status='OPEN',version=version+1,quoted_at=NULL,quote_snapshot=NULL
      WHERE conversation_id=chat.id AND status IN ('OPEN','QUOTED','CONFIRMED');
  END IF;
  IF pricing->>'mode' <> 'SINGLE' AND chat.customer_id IS DISTINCT FROM (pricing->>'customerId')::uuid THEN
    UPDATE public.whatsapp_conversations SET customer_id=(pricing->>'customerId')::uuid WHERE id=chat.id;
  END IF;
  RETURN pricing || jsonb_build_object('historySince',context_since);
END $$;

-- Recheck the context in the transaction that locks the cart and converts it.
CREATE OR REPLACE FUNCTION public.mutate_whatsapp_priced_order(
  p_job_id uuid,p_lease_token uuid,p_context_key text,p_organization_id uuid,p_integration_id uuid,
  p_conversation_id uuid,p_source_message_id uuid,p_operation text,
  p_cart_id uuid,p_version integer,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  job public.agent_jobs%ROWTYPE;
  pricing jsonb;
  chat public.whatsapp_conversations%ROWTYPE;
BEGIN
  job := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  IF (job.organization_id,job.integration_id,job.conversation_id,job.source_message_id)
    IS DISTINCT FROM (p_organization_id,p_integration_id,p_conversation_id,p_source_message_id) THEN
    RAISE EXCEPTION 'El trabajo no pertenece a esta conversación';
  END IF;
  SELECT * INTO chat FROM public.whatsapp_conversations WHERE id=p_conversation_id FOR UPDATE;
  pricing := public.whatsapp_pricing_context(p_organization_id,p_integration_id,p_conversation_id);
  IF pricing->>'key' IS DISTINCT FROM p_context_key OR pricing->>'reason' IS NOT NULL
    OR chat.customer_linked_at >= (SELECT created_at FROM public.whatsapp_messages WHERE id=p_source_message_id) THEN
    RAISE EXCEPTION 'Cambió el acceso comercial; consultá el estado nuevamente';
  END IF;
  IF p_operation='CONVERT' AND p_context_key IS NOT NULL AND (
    (p_payload->'order'->>'sales_price_list_id',p_payload->'order'->>'customer_id')
      IS DISTINCT FROM (pricing->>'listId',pricing->>'customerId')) THEN
    RAISE EXCEPTION 'La preventa requiere el cliente y la lista vigentes';
  END IF;
  RETURN public.mutate_whatsapp_order_leased(p_job_id,p_lease_token,p_organization_id,p_integration_id,p_conversation_id,
    p_source_message_id,p_operation,p_cart_id,p_version,p_payload);
END $$;

-- Recheck current chat control and Meta's window before reserving and dispatching.
CREATE OR REPLACE FUNCTION public.whatsapp_agent_source_can_dispatch(
  p_org uuid,p_integration uuid,p_chat uuid,p_source uuid,p_order_prompt boolean
) RETURNS boolean LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    JOIN public.whatsapp_integrations wi ON (wi.id,wi.organization_id)=(c.integration_id,c.organization_id)
    JOIN public.whatsapp_messages m ON m.id=p_source AND m.conversation_id=c.id AND m.direction='INBOUND'
    WHERE (c.id,wi.id,c.organization_id)=(p_chat,p_integration,p_org)
      AND wi.status='ACTIVE' AND public.is_whatsapp_mode_enabled(p_org,wi.phone_number_id)
      AND (c.customer_linked_at IS NULL OR m.created_at>c.customer_linked_at)
      AND (c.automation_resumed_at IS NULL OR m.created_at>c.automation_resumed_at)
      AND (wi.phone_number_id LIKE 'rhinos-local-simulator:%' OR c.last_customer_message_at+interval '24 hours'>clock_timestamp())
      AND (c.status='ACTIVE' OR (c.status='HANDOFF' AND c.human_claimed_at IS NULL AND NOT p_order_prompt
        AND EXISTS (SELECT 1 FROM public.whatsapp_conversation_events e WHERE e.conversation_id=c.id
          AND e.control_version=c.control_version AND e.type='HANDOFF' AND e.source_message_id=m.id)))
      AND NOT EXISTS (SELECT 1 FROM public.whatsapp_messages newer WHERE newer.conversation_id=c.id
        AND newer.direction='INBOUND' AND (newer.created_at,newer.id)>(m.created_at,m.id))
  )
$$;

CREATE OR REPLACE FUNCTION public.prepare_whatsapp_priced_outbox(p_job_id uuid,p_lease_token uuid,p_text text,p_order_prompt boolean,p_context_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.agent_jobs%ROWTYPE; x public.whatsapp_outbox%ROWTYPE; pricing jsonb;
BEGIN
  j := public.lock_whatsapp_job_lease(p_job_id,p_lease_token,'PROCESS_CONVERSATION');
  INSERT INTO public.whatsapp_outbox(source_message_id,organization_id,conversation_id,text,order_prompt,pricing_context_key)
    VALUES(j.source_message_id,j.organization_id,j.conversation_id,p_text,p_order_prompt,p_context_key) ON CONFLICT DO NOTHING;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE source_message_id = j.source_message_id FOR UPDATE;
  IF j.lease_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'El trabajo perdió su exclusión'; END IF;
  IF x.status = 'SENDING' THEN
    UPDATE public.whatsapp_outbox SET status = 'UNKNOWN',updated_at = clock_timestamp()
      WHERE source_message_id = j.source_message_id RETURNING * INTO x;
  ELSIF x.status = 'PENDING' THEN
    pricing := public.whatsapp_pricing_context(j.organization_id,j.integration_id,j.conversation_id);
    IF pricing->>'reason' IS NOT NULL OR pricing->>'key' IS DISTINCT FROM p_context_key
      OR x.pricing_context_key IS DISTINCT FROM p_context_key
      OR EXISTS (SELECT 1 FROM public.whatsapp_outbox other WHERE other.conversation_id = j.conversation_id
        AND other.id <> x.id AND other.status IN ('SENDING','UNKNOWN'))
      OR NOT public.whatsapp_agent_source_can_dispatch(j.organization_id,j.integration_id,j.conversation_id,j.source_message_id,x.order_prompt) THEN
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

-- Older workers may continue serving integrations on the default mode.
CREATE OR REPLACE FUNCTION public.prepare_whatsapp_outbox(p_job_id uuid,p_lease_token uuid,p_text text,p_order_prompt boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.prepare_whatsapp_priced_outbox(p_job_id,p_lease_token,p_text,p_order_prompt,NULL)
$$;

CREATE OR REPLACE FUNCTION public.guard_whatsapp_priced_dispatch(p_source_message_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  delivery public.whatsapp_outbox%ROWTYPE;
  pricing jsonb;
BEGIN
  SELECT * INTO delivery FROM public.whatsapp_outbox WHERE source_message_id=p_source_message_id
    AND origin='AGENT' AND status='SENDING' AND lease_token=p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  pricing := public.whatsapp_pricing_context(delivery.organization_id,delivery.integration_id,delivery.conversation_id);
  IF pricing->>'reason' IS NOT NULL OR pricing->>'key' IS DISTINCT FROM delivery.pricing_context_key
    OR NOT public.whatsapp_agent_source_can_dispatch(delivery.organization_id,delivery.integration_id,
      delivery.conversation_id,p_source_message_id,delivery.order_prompt)
    OR delivery.lease_expires_at <= clock_timestamp() THEN
    UPDATE public.whatsapp_outbox SET status='CANCELLED',updated_at=clock_timestamp() WHERE id=delivery.id;
    RETURN NULL;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_actor_can_link_customer(p_org uuid,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT public.whatsapp_actor_can_manage(p_org,p_actor) AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=p_org AND m.user_id=p_actor AND m.is_active
      AND (m.is_owner OR EXISTS (
        SELECT 1 FROM public.roles r
        JOIN public.role_permissions rp ON rp.role_id=r.id
        JOIN public.permissions p ON p.id=rp.permission_id
        WHERE r.id=m.role_id AND r.organization_id=p_org
          AND p.key IN ('customers.manage','organization.admin')
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_customer_link_chat(p_org uuid,p_actor uuid,p_chat uuid)
RETURNS public.whatsapp_conversations LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE chat public.whatsapp_conversations;
BEGIN
  chat := public.whatsapp_inbox_conversation(p_org,p_actor,p_chat);
  IF NOT public.whatsapp_actor_can_link_customer(p_org,p_actor) OR chat.status='CLOSED' OR NOT EXISTS (
    SELECT 1 FROM public.whatsapp_integrations wi WHERE wi.id=chat.integration_id
      AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
  ) THEN RAISE EXCEPTION 'No podés vincular clientes en esta conversación' USING ERRCODE='42501'; END IF;
  RETURN chat;
END $$;

CREATE OR REPLACE FUNCTION public.search_whatsapp_customer_links(p_org uuid,p_actor uuid,p_chat uuid,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  chat public.whatsapp_conversations := public.whatsapp_customer_link_chat(p_org,p_actor,p_chat);
  phone_key text := public.whatsapp_phone_key(chat.customer_phone);
BEGIN
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) FROM (
    SELECT c.id,coalesce(nullif(c.fantasy_name,''),c.business_name) AS name,
      coalesce(public.whatsapp_phone_key(c.phone)=phone_key,false) AS "samePhone"
    FROM public.customers c WHERE c.organization_id=p_org AND c.is_active AND phone_key IS NOT NULL
      AND (public.whatsapp_phone_key(c.phone)=phone_key OR
        (nullif(btrim(c.phone),'') IS NULL AND length(btrim(p_query))>=2
          AND strpos(lower(concat_ws(' ',c.business_name,c.fantasy_name,c.cuit)),lower(btrim(p_query)))>0))
    ORDER BY "samePhone" DESC,name,c.id LIMIT 15
  ) candidate);
END $$;

CREATE OR REPLACE FUNCTION public.link_whatsapp_customer(
  p_org uuid,p_actor uuid,p_chat uuid,p_customer uuid,p_new_customer jsonb
) RETURNS uuid LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  chat public.whatsapp_conversations := public.whatsapp_customer_link_chat(p_org,p_actor,p_chat);
  current_matches uuid[];
  phone_key text := public.whatsapp_phone_key(chat.customer_phone);
  target public.customers%ROWTYPE;
BEGIN
  IF phone_key IS NULL THEN RAISE EXCEPTION 'El número del chat no es válido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || phone_key,0));
  SELECT * INTO chat FROM public.whatsapp_conversations WHERE id=chat.id FOR UPDATE;
  PERFORM public.whatsapp_customer_link_chat(p_org,p_actor,p_chat);
  SELECT array_agg(c.id) INTO current_matches FROM public.whatsapp_customer_candidates(p_org,chat.customer_phone) c;
  IF cardinality(current_matches)>1 THEN RAISE EXCEPTION 'El número figura en más de una ficha activa. Corregí los teléfonos desde Clientes.'; END IF;
  IF p_customer IS NOT NULL THEN
    IF cardinality(current_matches)=1 AND current_matches[1]<>p_customer THEN
      RAISE EXCEPTION 'El número ya corresponde a otro cliente. Vinculá la ficha que coincide.';
    END IF;
    SELECT * INTO target FROM public.customers WHERE id=p_customer AND organization_id=p_org AND is_active FOR UPDATE;
    IF target.id IS NULL OR (nullif(btrim(target.phone),'') IS NOT NULL
      AND public.whatsapp_phone_key(target.phone) IS DISTINCT FROM phone_key) THEN
      RAISE EXCEPTION 'La ficha no está disponible para este número';
    END IF;
    IF nullif(btrim(target.phone),'') IS NULL THEN
      UPDATE public.customers SET phone='+' || phone_key WHERE id=target.id;
    END IF;
    IF chat.customer_id=target.id AND cardinality(current_matches)=1 THEN RETURN target.id; END IF;
  ELSE
    IF cardinality(current_matches)=1 THEN
      RAISE EXCEPTION 'Ya existe un cliente con este número. Usá Vincular cliente.';
    END IF;
    target := jsonb_populate_record(NULL::public.customers,p_new_customer);
    IF nullif(btrim(target.business_name),'') IS NULL THEN RAISE EXCEPTION 'La razón social es requerida'; END IF;
    IF target.cuit IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.organization_id=p_org AND c.cuit=target.cuit) THEN
      RAISE EXCEPTION 'Ya existe un cliente con ese CUIT';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_price_lists s WHERE (s.id,s.organization_id)=(target.sales_price_list_id,p_org)
      AND s.is_active AND (s.valid_from IS NULL OR s.valid_from <= (statement_timestamp() AT TIME ZONE 'UTC')::date)) THEN
      RAISE EXCEPTION 'Seleccioná una lista de venta vigente de la empresa';
    END IF;
    IF target.assigned_seller_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m WHERE m.organization_id=p_org AND m.user_id=target.assigned_seller_id AND m.is_active
    ) THEN RAISE EXCEPTION 'El vendedor seleccionado no pertenece a la empresa'; END IF;
    IF target.preferred_carrier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.carriers c WHERE c.organization_id=p_org AND c.id=target.preferred_carrier_id AND c.is_active
    ) THEN RAISE EXCEPTION 'El transporte seleccionado no pertenece a la empresa'; END IF;
    INSERT INTO public.customers (organization_id,business_name,fantasy_name,cuit,phone,email,address,city,province,
      delivery_address,delivery_city,tax_condition,client_number,sales_price_list_id,customer_channel,assigned_seller_id,
      preferred_carrier_id,due_days,is_active)
    VALUES (p_org,target.business_name,target.fantasy_name,target.cuit,'+' || phone_key,target.email,target.address,target.city,
      target.province,target.delivery_address,target.delivery_city,target.tax_condition,target.client_number,target.sales_price_list_id,
      target.customer_channel,target.assigned_seller_id,target.preferred_carrier_id,target.due_days,true)
    RETURNING id INTO target.id;
  END IF;

  UPDATE public.whatsapp_conversations SET customer_id=target.id,customer_linked_at=clock_timestamp(),
    pending_order_action=NULL WHERE id=chat.id;
  UPDATE public.conversation_carts SET status='OPEN',version=version+1,quoted_at=NULL,quote_snapshot=NULL
    WHERE conversation_id=chat.id AND status IN ('OPEN','QUOTED','CONFIRMED');
  RETURN target.id;
END $$;

CREATE OR REPLACE FUNCTION public.list_whatsapp_inbox(
  p_org uuid, p_actor uuid, p_filter text, p_search text, p_at timestamptz DEFAULT NULL, p_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.whatsapp_actor_can_read(p_org, p_actor) OR (p_filter = 'simulation' AND NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org AND whatsapp_sandbox_enabled
  )) THEN RAISE SQLSTATE '42501' USING MESSAGE = 'WhatsApp no disponible'; END IF;
  RETURN jsonb_build_object(
    'attentionCount', (
      SELECT count(*) FROM public.whatsapp_conversations c
      JOIN public.whatsapp_integrations wi ON (wi.id, wi.organization_id) = (c.integration_id, c.organization_id)
      WHERE c.organization_id = p_org AND c.status = 'HANDOFF' AND c.human_claimed_at IS NULL
        AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    ),
    'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'at', c.activity_at, 'lastMessageAt', c.last_message_at,
      'customerPhone', c.customer_phone, 'status', c.status,
      'customerName', CASE WHEN c.pricing_mode='SINGLE' OR c.customer_id::text=pricing.value->>'customerId' THEN c.customer_name END,
      'pendingCustomer', p_filter <> 'simulation' AND CASE WHEN c.pricing_mode='SINGLE' THEN c.active_customer_id IS NULL
        ELSE pricing.value->>'customerId' IS NULL END,
      'assignedUserId', c.assigned_user_id, 'assignedName', nullif(assignee.raw_user_meta_data->>'full_name',''),
      'humanClaimedAt', c.human_claimed_at,
      'preview', msg.preview, 'unread', unread.total
    ) ORDER BY c.activity_at DESC, c.id DESC), '[]')
    FROM (
      SELECT c.*, wi.pricing_mode, cu.id AS active_customer_id, coalesce(c.last_message_at, c.created_at) AS activity_at,
        coalesce(nullif(cu.fantasy_name, ''), cu.business_name) AS customer_name
      FROM public.whatsapp_conversations c
      JOIN public.whatsapp_integrations wi ON (wi.id, wi.organization_id) = (c.integration_id, c.organization_id)
      LEFT JOIN public.customers cu ON (cu.id, cu.organization_id) = (c.customer_id, c.organization_id) AND cu.is_active
      WHERE c.organization_id = p_org
        AND (wi.phone_number_id LIKE 'rhinos-local-simulator:%') = (p_filter = 'simulation')
        AND CASE p_filter WHEN 'attention' THEN c.status = 'HANDOFF' AND c.human_claimed_at IS NULL
          WHEN 'mine' THEN c.assigned_user_id = p_actor AND c.status = 'HANDOFF'
          WHEN 'agent' THEN c.status = 'ACTIVE' ELSE true END
        AND (p_search = '' OR strpos(lower(concat_ws(' ', c.customer_phone, cu.fantasy_name, cu.business_name)), lower(p_search)) > 0)
        AND (p_at IS NULL OR (coalesce(c.last_message_at,c.created_at), c.id) < (p_at, p_id))
      ORDER BY coalesce(c.last_message_at,c.created_at) DESC, c.id DESC LIMIT 31
    ) c
    LEFT JOIN LATERAL (SELECT public.whatsapp_pricing_context(c.organization_id,c.integration_id,c.id) AS value)
      pricing ON c.pricing_mode<>'SINGLE'
    LEFT JOIN auth.users assignee ON assignee.id = c.assigned_user_id
    LEFT JOIN public.whatsapp_conversation_reads r ON r.conversation_id = c.id AND r.user_id = p_actor
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('direction', m.direction, 'type', m.message_type,
        'content', CASE WHEN m.message_type = 'AUDIO' THEN NULL ELSE left(m.content, 160) END) AS preview
      FROM public.whatsapp_messages m WHERE m.conversation_id = c.id
      ORDER BY coalesce(m.inbox_at,m.created_at) DESC, m.id DESC LIMIT 1
    ) msg ON true
    CROSS JOIN LATERAL (
      SELECT count(*) AS total FROM (
        SELECT 1 FROM public.whatsapp_messages m WHERE m.conversation_id = c.id AND m.direction = 'INBOUND'
          AND (coalesce(m.inbox_at,m.created_at),m.id) > (coalesce(r.message_at,'-infinity'),coalesce(r.message_id,'00000000-0000-0000-0000-000000000000'))
        LIMIT 100
      ) recent
    ) unread)
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_inbox_detail(p_org uuid, p_actor uuid, p_chat uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c public.whatsapp_conversations := public.whatsapp_inbox_conversation(p_org,p_actor,p_chat);
BEGIN
  RETURN public.whatsapp_conversation_control_state(p_org,p_chat) || jsonb_build_object(
    'customerPhone', c.customer_phone,
    'customerId', CASE WHEN wi.pricing_mode='SINGLE' THEN (
      SELECT id::text FROM public.customers WHERE id=c.customer_id AND organization_id=p_org AND is_active
    ) ELSE pricing.value->>'customerId' END,
    'pricingReview', pricing.value->>'reason',
    'canLinkCustomer', c.status <> 'CLOSED' AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
      AND public.whatsapp_actor_can_link_customer(p_org,p_actor),
    'customerName', (SELECT coalesce(nullif(fantasy_name,''),business_name) FROM public.customers
      WHERE id = CASE WHEN wi.pricing_mode='SINGLE' THEN c.customer_id ELSE (pricing.value->>'customerId')::uuid END
      AND organization_id = p_org AND is_active),
    'handoffReason', c.handoff_reason, 'windowEndsAt', c.last_customer_message_at + interval '24 hours',
    'isSimulator', wi.phone_number_id LIKE 'rhinos-local-simulator:%',
    'canManage', public.whatsapp_actor_can_manage(p_org,p_actor),
    'audioEnabled', (SELECT CASE WHEN wi.phone_number_id LIKE 'rhinos-local-simulator:%'
      THEN o.whatsapp_sandbox_audio_enabled ELSE o.whatsapp_audio_enabled END FROM public.organizations o WHERE o.id = p_org),
    'canSend', wi.status = 'ACTIVE' AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
      AND public.whatsapp_human_outbox_protocol_version() = 1,
    'operators', public.list_whatsapp_control_operators(p_org),
    'readCursor', (SELECT jsonb_build_object('id',r.message_id,'at',r.message_at)
      FROM public.whatsapp_conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = p_actor),
    'pendingOrder', (SELECT jsonb_build_object('status',cart.status,'createdAt',cart.created_at)
      FROM public.conversation_carts cart WHERE cart.organization_id = p_org AND cart.conversation_id = c.id
        AND cart.status IN ('OPEN','QUOTED','CONFIRMED') ORDER BY cart.created_at DESC LIMIT 1),
    'preSales', (SELECT coalesce(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]')
      FROM (SELECT jsonb_build_object('id',id,'number',sale_number::text,'date',sale_date,'status',status) item, created_at
        FROM public.sales_orders WHERE organization_id = p_org AND conversation_id = c.id AND source = 'WHATSAPP'
        ORDER BY created_at DESC LIMIT 20) s),
    'commands', (SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at,x.id), '[]')
      FROM (
        SELECT jsonb_build_object('id',x.id,'status',x.status,'at',x.created_at,
          'text',CASE WHEN x.origin = 'HUMAN' THEN x.text END,
          'windowExpired',coalesce(x.reason_code = 'WINDOW_EXPIRED',false)) AS item, x.created_at, x.id
        FROM public.whatsapp_outbox x WHERE x.organization_id = p_org AND x.conversation_id = c.id
          AND (x.status = 'UNKNOWN' OR (x.origin = 'HUMAN' AND x.status <> 'SENT'))
        ORDER BY (x.status = 'UNKNOWN') DESC, x.created_at DESC, x.id DESC LIMIT 30
      ) x)
  ) FROM public.whatsapp_integrations wi
  CROSS JOIN LATERAL (SELECT public.whatsapp_pricing_context(p_org,c.integration_id,c.id) AS value) pricing
  WHERE (wi.id,wi.organization_id) = (c.integration_id,p_org);
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_customer_pricing_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT true
$$;

DO $$ DECLARE fn record; BEGIN
  FOR fn IN SELECT oid::regprocedure AS signature FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname IN (
      'whatsapp_customer_candidates','whatsapp_pricing_context','whatsapp_job_pricing','whatsapp_customer_pricing_ready',
      'whatsapp_agent_source_can_dispatch',
      'mutate_whatsapp_priced_order','prepare_whatsapp_priced_outbox','prepare_whatsapp_outbox','guard_whatsapp_priced_dispatch',
      'whatsapp_actor_can_link_customer','whatsapp_customer_link_chat','search_whatsapp_customer_links','link_whatsapp_customer'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
