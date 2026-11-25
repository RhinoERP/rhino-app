BEGIN;

-- One root without children, or children of one root. Unassigned items remain
-- unassigned commercially; their documentary origin is the standalone order.
CREATE FUNCTION public.order_remittance_dispatch_items(p_org_id uuid, p_order_ids uuid[])
RETURNS TABLE (quote_item_id uuid, order_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, o.id
  FROM public.orders o
  JOIN public.quotes budget ON budget.id = o.quote_id AND budget.organization_id = o.organization_id
  JOIN public.quote_items q ON q.quote_id = o.quote_id
  WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids)
    AND (
      (o.parent_order_id IS NOT NULL AND q.assigned_order_id = o.id)
      OR (o.parent_order_id IS NULL AND cardinality(p_order_ids) = 1
        AND (q.assigned_order_id = o.id OR q.assigned_order_id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM public.orders child
          WHERE child.organization_id = p_org_id AND child.parent_order_id = o.id))
    );
$$;
REVOKE ALL ON FUNCTION public.order_remittance_dispatch_items(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.order_remittance_source_fingerprint(
  p_org_id uuid, p_order_ids uuid[]
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH selected_orders AS (
    SELECT o.* FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids)
  ), context_orders AS (
    SELECT o.* FROM public.orders o WHERE o.organization_id = p_org_id
      AND (o.id = ANY(p_order_ids) OR o.id IN (SELECT parent_order_id FROM selected_orders))
  ), context_sales AS (
    SELECT s.* FROM public.sales_orders s WHERE s.organization_id = p_org_id
      AND s.id IN (SELECT sales_order_id FROM context_orders)
  ), selected_items AS (
    SELECT q.* FROM public.quote_items q
    JOIN public.order_remittance_dispatch_items(p_org_id, p_order_ids) source ON source.quote_item_id = q.id
  )
  SELECT md5(jsonb_build_object(
    'orders', (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM context_orders o),
    'children', (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.orders o
      WHERE o.organization_id = p_org_id AND o.parent_order_id IN
        (SELECT id FROM selected_orders WHERE parent_order_id IS NULL)),
    'sales', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM context_sales s),
    'carriers', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.carriers c
      WHERE c.organization_id = p_org_id AND c.id IN (SELECT carrier_id FROM context_sales)),
    'quotes', (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM public.quotes q
      WHERE q.organization_id = p_org_id AND q.id IN (SELECT quote_id FROM selected_orders)),
    'customers', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.customers c
      WHERE c.organization_id = p_org_id AND c.id IN (SELECT q.customer_id FROM public.quotes q
        WHERE q.organization_id = p_org_id AND q.id IN (SELECT quote_id FROM selected_orders))),
    'issuer', (SELECT to_jsonb(o) - 'remittance_last_number' - 'updated_at'
      FROM public.organizations o WHERE o.id = p_org_id),
    'settings', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.organization_id)
      FROM public.organization_settings s WHERE s.organization_id = p_org_id),
    'items', (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM selected_items q),
    'extras', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.quote_item_extras e
      WHERE e.quote_item_id IN (SELECT id FROM selected_items)),
    'sale_items', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.sales_order_items s
      WHERE s.organization_id = p_org_id AND s.quote_item_id IN (SELECT id FROM selected_items)),
    'products', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.products p
      WHERE p.organization_id = p_org_id AND p.id IN (SELECT product_id FROM selected_items)),
    'variants', (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM public.product_variants v
      WHERE v.organization_id = p_org_id AND v.id IN (SELECT product_variant_id FROM selected_items))
  )::text);
$$;

-- Keep the existing lock order and NOWAIT policy, including unassigned sources.
CREATE OR REPLACE FUNCTION public.lock_order_remittance_dispatch_sources(
  p_org_id uuid, p_actor_id uuid, p_parent_id uuid, p_order_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent public.orders%ROWTYPE;
  v_current public.orders%ROWTYPE;
  v_sale_ids uuid[];
  v_item_ids uuid[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Esta operación requiere el servicio de despacho' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  SELECT * INTO STRICT v_parent FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = p_parent_id;
  SELECT coalesce(array_agg(DISTINCT o.sales_order_id ORDER BY o.sales_order_id), '{}'::uuid[])
    INTO v_sale_ids FROM public.orders o WHERE o.organization_id = p_org_id
      AND o.sales_order_id IS NOT NULL AND (o.id = p_parent_id OR
        (o.parent_order_id = p_parent_id AND o.id = ANY(p_order_ids)));
  PERFORM s.id FROM public.sales_orders s WHERE s.organization_id = p_org_id AND s.id = ANY(v_sale_ids)
    ORDER BY s.id FOR UPDATE NOWAIT;
  IF (SELECT count(*) FROM public.sales_orders s
      WHERE s.organization_id = p_org_id AND s.id = ANY(v_sale_ids)) <> cardinality(v_sale_ids) THEN
    RAISE EXCEPTION 'Una venta no pertenece a la organización';
  END IF;
  PERFORM a.id FROM public.accounts_receivable a WHERE a.organization_id = p_org_id
    AND a.sales_order_id = ANY(v_sale_ids) ORDER BY a.id FOR UPDATE NOWAIT;
  PERFORM q.id FROM public.quotes q WHERE q.organization_id = p_org_id
    AND q.id = v_parent.quote_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'El presupuesto no pertenece a la organización'; END IF;
  PERFORM c.id FROM public.customers c WHERE c.organization_id = p_org_id AND c.id IN (
    SELECT q.customer_id FROM public.quotes q WHERE q.organization_id = p_org_id AND q.id = v_parent.quote_id
  ) FOR SHARE NOWAIT;
  PERFORM c.id FROM public.carriers c WHERE c.organization_id = p_org_id AND c.id IN (
    SELECT s.carrier_id FROM public.sales_orders s WHERE s.organization_id = p_org_id AND s.id = ANY(v_sale_ids)
  ) FOR SHARE NOWAIT;
  SELECT * INTO STRICT v_current FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = p_parent_id FOR UPDATE NOWAIT;
  IF v_current.sales_order_id IS DISTINCT FROM v_parent.sales_order_id
     OR v_current.quote_id IS DISTINCT FROM v_parent.quote_id THEN
    RAISE EXCEPTION 'Cambió la venta o el presupuesto del pedido; actualizá la preparación';
  END IF;
  PERFORM o.id FROM public.orders o WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_id
    ORDER BY o.id FOR UPDATE NOWAIT;
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids)
    AND o.sales_order_id IS NOT NULL AND NOT (o.sales_order_id = ANY(v_sale_ids))) THEN
    RAISE EXCEPTION 'Cambió la venta de un pedido; actualizá la preparación';
  END IF;
  SELECT coalesce(array_agg(source.quote_item_id), '{}'::uuid[]) INTO v_item_ids
    FROM public.order_remittance_dispatch_items(p_org_id, p_order_ids) source;
  PERFORM q.id FROM public.quote_items q WHERE q.id = ANY(v_item_ids) ORDER BY q.id FOR UPDATE NOWAIT;
  PERFORM e.id FROM public.quote_item_extras e WHERE e.quote_item_id = ANY(v_item_ids)
    ORDER BY e.id FOR SHARE NOWAIT;
  PERFORM s.id FROM public.sales_order_items s WHERE s.organization_id = p_org_id
    AND s.quote_item_id = ANY(v_item_ids) ORDER BY s.id FOR SHARE NOWAIT;
  PERFORM p.id FROM public.products p WHERE p.organization_id = p_org_id
    AND p.id IN (SELECT product_id FROM public.quote_items WHERE id = ANY(v_item_ids)) ORDER BY p.id FOR SHARE NOWAIT;
  PERFORM v.id FROM public.product_variants v WHERE v.organization_id = p_org_id
    AND v.id IN (SELECT product_variant_id FROM public.quote_items WHERE id = ANY(v_item_ids)) ORDER BY v.id FOR SHARE NOWAIT;
  PERFORM s.organization_id FROM public.organization_settings s WHERE s.organization_id = p_org_id FOR SHARE NOWAIT;
  PERFORM o.id FROM public.organizations o WHERE o.id = p_org_id FOR UPDATE NOWAIT;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_order_remittance_documents_internal(
  p_org_id uuid, p_actor_id uuid, p_parent_order_id uuid, p_order_ids uuid[],
  p_idempotency_key uuid, p_expected_source_fingerprint text,
  p_automatic_numbering boolean, p_documents jsonb
) RETURNS TABLE (batch_id uuid, remittance_id uuid, document_number text, document_position integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_parent public.orders%ROWTYPE;
  v_existing public.order_remittance_batches%ROWTYPE;
  v_batch_id uuid := gen_random_uuid();
  v_group_id uuid := gen_random_uuid();
  v_document_id uuid;
  v_line_id uuid;
  v_permissions text[];
  v_owner boolean;
  v_all boolean;
  v_standalone boolean;
  v_ids uuid[];
  v_item_ids uuid[];
  v_request_fingerprint text;
  v_doc jsonb;
  v_line jsonb;
  v_source jsonb;
  v_doc_index integer := 0;
  v_line_index integer;
  v_number text;
  v_counter bigint;
  v_seen uuid[] := '{}'::uuid[];
  v_item public.quote_items%ROWTYPE;
  v_source_order_id uuid;
  v_line_qty numeric;
  v_source_qty numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_count integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Esta operación requiere el servicio de despacho' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_parent_order_id IS NULL
     OR p_idempotency_key IS NULL OR p_automatic_numbering IS NULL
     OR nullif(p_expected_source_fingerprint, '') IS NULL
     OR coalesce(cardinality(p_order_ids), 0) = 0 OR array_position(p_order_ids, NULL) IS NOT NULL
     OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Solicitud de remitos inválida';
  END IF;
  IF jsonb_array_length(p_documents) = 0 THEN RAISE EXCEPTION 'El despacho necesita al menos un remito'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_order_ids) x;
  IF cardinality(v_ids) <> cardinality(p_order_ids) THEN RAISE EXCEPTION 'La selección contiene pedidos repetidos'; END IF;
  -- The public entry point has already acquired all locks in operational order.
  SELECT * INTO STRICT v_org FROM public.organizations WHERE id = p_org_id FOR UPDATE;
  SELECT m.is_owner INTO v_owner FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(array_agg(DISTINCT p.key), '{}'::text[]) INTO v_permissions
    FROM public.organization_members m
    JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active;
  v_all := coalesce(v_owner, false) OR 'organization.admin' = ANY(v_permissions)
    OR 'orders.manage.all' = ANY(v_permissions) OR 'orders.read.all' = ANY(v_permissions);
  IF NOT (coalesce(v_owner, false) OR 'organization.admin' = ANY(v_permissions) OR 'orders.dispatch' = ANY(v_permissions)) THEN
    RAISE EXCEPTION 'Sin permiso para despachar' USING ERRCODE = '42501';
  END IF;
  v_request_fingerprint := md5(jsonb_build_object(
    'parent', p_parent_order_id, 'orders', v_ids, 'actor', p_actor_id,
    'source', p_expected_source_fingerprint, 'automatic', p_automatic_numbering, 'documents', p_documents
  )::text);
  SELECT * INTO v_existing FROM public.order_remittance_batches b
    WHERE b.organization_id = p_org_id AND b.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RAISE EXCEPTION 'La clave de confirmación ya corresponde a otra solicitud';
    END IF;
    RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
      FROM public.order_remittances r WHERE r.batch_id = v_existing.id ORDER BY r.document_position;
    RETURN;
  END IF;
  SELECT * INTO STRICT v_parent FROM public.orders o
    WHERE o.id = p_parent_order_id AND o.organization_id = p_org_id FOR UPDATE;
  IF v_parent.parent_order_id IS NOT NULL THEN RAISE EXCEPTION 'Se esperaba un pedido padre'; END IF;
  IF NOT v_all AND v_parent.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Pedido fuera del alcance del usuario' USING ERRCODE = '42501';
  END IF;
  v_standalone := cardinality(v_ids) = 1 AND v_ids[1] = p_parent_order_id;
  IF v_standalone AND EXISTS (SELECT 1 FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_order_id) THEN
    RAISE EXCEPTION 'Este pedido tiene subpedidos. Seleccioná sus envíos.';
  END IF;
  PERFORM o.id FROM public.orders o WHERE o.organization_id = p_org_id AND o.id = ANY(v_ids) ORDER BY o.id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(v_ids)
      AND ((v_standalone AND o.id = p_parent_order_id AND o.parent_order_id IS NULL)
        OR (NOT v_standalone AND o.parent_order_id = p_parent_order_id))
      AND o.quote_id = v_parent.quote_id AND o.status = 'PREPARING' AND (v_all OR o.created_by = p_actor_id);
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Los pedidos cambiaron, no están en preparación o no son accesibles';
  END IF;
  SELECT coalesce(array_agg(source.quote_item_id), '{}'::uuid[]) INTO v_item_ids
    FROM public.order_remittance_dispatch_items(p_org_id, v_ids) source;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) selected(id) WHERE NOT EXISTS (
    SELECT 1 FROM public.order_remittance_dispatch_items(p_org_id, v_ids) source WHERE source.order_id = selected.id
  )) THEN RAISE EXCEPTION 'Uno de los pedidos no tiene productos para documentar'; END IF;
  IF public.order_remittance_source_fingerprint(p_org_id, v_ids) IS DISTINCT FROM p_expected_source_fingerprint THEN
    RAISE EXCEPTION 'Cambió el contenido del despacho; actualizá la vista previa';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_remittance_line_sources s
    JOIN public.order_remittance_lines l ON l.id = s.line_id
    JOIN public.order_remittances r ON r.id = l.remittance_id
    WHERE s.organization_id = p_org_id AND s.order_id = ANY(v_ids) AND r.status = 'ISSUED'
  ) OR EXISTS (SELECT 1 FROM public.order_dispatch_events e WHERE e.order_id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'Un pedido ya tiene documentación de despacho; requiere revisión';
  END IF;
  IF p_automatic_numbering AND NOT coalesce(v_org.remittance_auto_enabled, false) THEN
    RAISE EXCEPTION 'La numeración automática no está habilitada';
  END IF;
  v_counter := coalesce(v_org.remittance_last_number, 0);
  INSERT INTO public.order_remittance_batches (
    id, organization_id, parent_order_id, dispatch_group_id, idempotency_key, request_fingerprint, created_by
  ) VALUES (v_batch_id, p_org_id, p_parent_order_id, v_group_id, p_idempotency_key, v_request_fingerprint, p_actor_id);
  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    v_doc_index := v_doc_index + 1;
    IF jsonb_typeof(v_doc) IS DISTINCT FROM 'object' OR jsonb_typeof(v_doc->'lines') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_doc->'header_snapshot') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Documento inválido'; END IF;
    v_count := jsonb_array_length(v_doc->'lines');
    IF v_count NOT BETWEEN 1 AND 26 OR (v_doc_index < jsonb_array_length(p_documents) AND v_count <> 26) THEN
      RAISE EXCEPTION 'La distribución debe completar bloques de 26 líneas salvo el último';
    END IF;
    v_number := nullif(btrim(v_doc->>'document_number'), '');
    IF p_automatic_numbering AND v_number IS NOT NULL THEN RAISE EXCEPTION 'No se deben enviar números definitivos en modo automático'; END IF;
    LOOP
      IF p_automatic_numbering THEN
        v_counter := v_counter + 1;
        v_number := CASE WHEN nullif(v_org.remittance_prefix, '') IS NULL THEN '' ELSE v_org.remittance_prefix || '-' END
          || CASE WHEN length(v_counter::text) < 5 THEN lpad(v_counter::text, 5, '0') ELSE v_counter::text END;
      ELSIF v_number IS NULL THEN RAISE EXCEPTION 'Falta el número manual de un remito'; END IF;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.order_remittances r WHERE r.organization_id = p_org_id
          AND public.order_remittance_number_key(r.document_number) = public.order_remittance_number_key(v_number)
        UNION ALL
        SELECT 1 FROM public.order_dispatch_events e JOIN public.orders o ON o.id = e.order_id WHERE o.organization_id = p_org_id
          AND public.order_remittance_number_key(e.remito_number) = public.order_remittance_number_key(v_number)
        UNION ALL
        SELECT 1 FROM public.sales_orders s WHERE s.organization_id = p_org_id
          AND public.order_remittance_number_key(s.remittance_number) = public.order_remittance_number_key(v_number)
      );
      IF NOT p_automatic_numbering THEN RAISE EXCEPTION 'Número de remito ocupado: %', v_number; END IF;
    END LOOP;
    v_document_id := gen_random_uuid();
    v_subtotal := 0;
    v_discount := 0;
    INSERT INTO public.order_remittances (
      id, organization_id, batch_id, document_number, document_position, issue_date,
      package_count, declared_value, subtotal, discount_total, total, currency, header_snapshot
    ) VALUES (v_document_id, p_org_id, v_batch_id, v_number, v_doc_index,
      (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      (v_doc->>'package_count')::integer, (v_doc->>'declared_value')::numeric, 0, 0, 0,
      v_doc->>'currency', v_doc->'header_snapshot');
    IF (v_doc->>'package_count')::numeric IS DISTINCT FROM (v_doc->>'package_count')::integer::numeric
       OR (v_doc->>'declared_value')::numeric IS DISTINCT FROM trunc((v_doc->>'declared_value')::numeric, 2) THEN
      RAISE EXCEPTION 'Bultos o valor declarado tienen una precisión inválida';
    END IF;
    v_line_index := 0;
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_doc->'lines') LOOP
      v_line_index := v_line_index + 1;
      IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' OR jsonb_typeof(v_line->'sources') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Línea inválida';
      END IF;
      IF jsonb_array_length(v_line->'sources') = 0 THEN RAISE EXCEPTION 'Línea sin orígenes'; END IF;
      IF (v_line->>'quantity')::numeric IS DISTINCT FROM trunc((v_line->>'quantity')::numeric, 6)
        OR (v_line->>'weight_quantity')::numeric IS DISTINCT FROM trunc((v_line->>'weight_quantity')::numeric, 6)
        OR (v_line->>'unit_price')::numeric IS DISTINCT FROM trunc((v_line->>'unit_price')::numeric, 6)
        OR (v_line->>'subtotal')::numeric IS DISTINCT FROM trunc((v_line->>'subtotal')::numeric, 6)
        OR (v_line->>'discount_percentage')::numeric IS DISTINCT FROM trunc((v_line->>'discount_percentage')::numeric, 4) THEN
        RAISE EXCEPTION 'La precisión de una línea excede la soportada por el documento';
      END IF;
      v_line_id := gen_random_uuid();
      INSERT INTO public.order_remittance_lines (
        id, organization_id, remittance_id, line_position, product_id, product_variant_id, sku,
        product_name, brand, variant_name, unit_of_measure, quantity, weight_quantity, unit_price,
        subtotal, discount_percentage, extras_snapshot
      ) VALUES (v_line_id, p_org_id, v_document_id, v_line_index,
        (v_line->>'product_id')::uuid, (v_line->>'product_variant_id')::uuid,
        v_line->>'sku', v_line->>'product_name', v_line->>'brand', v_line->>'variant_name',
        (v_line->>'unit_of_measure')::public.unit_of_measure_type,
        (v_line->>'quantity')::numeric, (v_line->>'weight_quantity')::numeric,
        (v_line->>'unit_price')::numeric, (v_line->>'subtotal')::numeric,
        (v_line->>'discount_percentage')::numeric, coalesce(v_line->'extras_snapshot', '[]'::jsonb));
      v_line_qty := 0;
      FOR v_source IN SELECT value FROM jsonb_array_elements(v_line->'sources') LOOP
        SELECT * INTO STRICT v_item FROM public.quote_items q WHERE q.id = (v_source->>'quote_item_id')::uuid;
        SELECT source.order_id INTO v_source_order_id FROM public.order_remittance_dispatch_items(p_org_id, v_ids) source
          WHERE source.quote_item_id = v_item.id;
        v_source_qty := (v_source->>'quantity')::numeric;
        IF v_item.id = ANY(v_seen) OR NOT (v_item.id = ANY(v_item_ids))
          OR v_source_order_id IS NULL OR v_source_order_id IS DISTINCT FROM (v_source->>'order_id')::uuid
          OR v_item.quote_id IS DISTINCT FROM v_parent.quote_id OR v_item.quantity IS DISTINCT FROM v_source_qty
          OR v_source_qty <= 0 OR v_source_qty = 'NaN'::numeric OR v_source_qty IS DISTINCT FROM trunc(v_source_qty, 6)
          OR v_item.product_id IS DISTINCT FROM (v_line->>'product_id')::uuid
          OR v_item.product_variant_id IS DISTINCT FROM (v_line->>'product_variant_id')::uuid THEN
          RAISE EXCEPTION 'Origen duplicado, modificado o fuera del despacho';
        END IF;
        v_seen := array_append(v_seen, v_item.id);
        v_line_qty := v_line_qty + v_source_qty;
        INSERT INTO public.order_remittance_line_sources (organization_id, line_id, order_id, quote_item_id, quantity)
          VALUES (p_org_id, v_line_id, v_source_order_id, v_item.id, v_source_qty);
      END LOOP;
      IF v_line_qty IS DISTINCT FROM (v_line->>'quantity')::numeric THEN
        RAISE EXCEPTION 'La cantidad impresa no coincide con sus orígenes';
      END IF;
      v_subtotal := v_subtotal + (v_line->>'subtotal')::numeric;
      v_discount := v_discount + (v_line->>'subtotal')::numeric * coalesce((v_line->>'discount_percentage')::numeric, 0) / 100;
    END LOOP;
    UPDATE public.order_remittances r SET subtotal = trunc(v_subtotal, 2), discount_total = trunc(v_discount, 2),
      total = trunc(v_subtotal, 2) - trunc(v_discount, 2) WHERE r.id = v_document_id;
  END LOOP;
  IF cardinality(v_item_ids) = 0 OR cardinality(v_item_ids) <> cardinality(v_seen) THEN
    RAISE EXCEPTION 'La distribución omite ítems del despacho';
  END IF;
  IF p_automatic_numbering THEN UPDATE public.organizations SET remittance_last_number = v_counter WHERE id = p_org_id; END IF;
  RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
    FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_order_remittance_dispatch_internal(
  p_org_id uuid, p_actor_id uuid, p_parent_order_id uuid, p_order_ids uuid[],
  p_idempotency_key uuid, p_expected_source_fingerprint text,
  p_automatic_numbering boolean, p_documents jsonb
) RETURNS TABLE (batch_id uuid, remittance_id uuid, document_number text, document_position integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_documents jsonb;
  v_batch_id uuid;
  v_group_id uuid;
  v_parent public.orders%ROWTYPE;
  v_sale public.sales_orders%ROWTYPE;
  v_child record;
  v_number text;
  v_packages integer;
  v_declared numeric;
  v_new_status public.order_flow_status;
  v_event_count integer;
  v_now timestamptz := clock_timestamp();
  v_has_unassigned boolean;
  v_standalone boolean;
  v_requires_fiscal boolean;
BEGIN
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.document_position) INTO v_documents
    FROM public.persist_order_remittance_documents_internal(
      p_org_id, p_actor_id, p_parent_order_id, p_order_ids, p_idempotency_key,
      p_expected_source_fingerprint, p_automatic_numbering, p_documents) r;
  v_batch_id := (v_documents->0->>'batch_id')::uuid;
  SELECT b.dispatch_group_id INTO STRICT v_group_id FROM public.order_remittance_batches b WHERE b.id = v_batch_id;
  SELECT count(*) INTO v_event_count FROM public.order_dispatch_events e WHERE e.dispatch_group_id = v_group_id;
  IF v_event_count > 0 THEN
    IF v_event_count <> cardinality(p_order_ids) OR EXISTS (SELECT 1 FROM public.order_dispatch_events e
      WHERE e.dispatch_group_id = v_group_id AND NOT (e.order_id = ANY(p_order_ids))) THEN
      RAISE EXCEPTION 'El despacho guardado está incompleto; requiere revisión';
    END IF;
    RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
      FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
    RETURN;
  END IF;
  SELECT * INTO STRICT v_parent FROM public.orders o
    WHERE o.id = p_parent_order_id AND o.organization_id = p_org_id FOR UPDATE;
  IF v_parent.status::text IN ('CANCELLED', 'DELIVERED', 'FINANCE_REJECTED') THEN
    RAISE EXCEPTION 'El pedido padre no está habilitado para despachar';
  END IF;
  v_standalone := cardinality(p_order_ids) = 1 AND p_order_ids[1] = p_parent_order_id;
  PERFORM o.id FROM public.orders o WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_order_id
    ORDER BY o.id FOR UPDATE;
  IF v_parent.sales_order_id IS NOT NULL THEN
    SELECT * INTO STRICT v_sale FROM public.sales_orders s
      WHERE s.id = v_parent.sales_order_id AND s.organization_id = p_org_id FOR UPDATE;
    IF v_sale.status::text NOT IN ('CONFIRMED', 'DISPATCH') THEN
      RAISE EXCEPTION 'La venta debe estar confirmada antes de despachar; requiere revisión';
    END IF;
  END IF;
  FOR v_child IN SELECT o.id, o.status FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids) ORDER BY o.id
  LOOP
    IF v_child.status::text <> 'PREPARING' THEN RAISE EXCEPTION 'El estado del pedido cambió durante la confirmación'; END IF;
    -- Representative event for compatibility; composition lives in the documents.
    SELECT r.document_number, r.package_count, r.declared_value INTO STRICT v_number, v_packages, v_declared
      FROM public.order_remittances r WHERE r.batch_id = v_batch_id AND EXISTS (
        SELECT 1 FROM public.order_remittance_lines l JOIN public.order_remittance_line_sources s ON s.line_id = l.id
        WHERE l.remittance_id = r.id AND s.order_id = v_child.id
      ) ORDER BY r.document_position LIMIT 1;
    INSERT INTO public.order_dispatch_events (order_id, remito_number, dispatch_group_id, dispatched_at, package_count, declared_value, notes)
      VALUES (v_child.id, v_number, v_group_id, v_now, v_packages, v_declared,
        'Despacho documentado; consultar composición en los remitos del lote');
    UPDATE public.orders SET status = 'DISPATCHED', updated_at = v_now WHERE id = v_child.id AND organization_id = p_org_id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, notes, changed_by, changed_at)
      VALUES (v_child.id, 'PREPARING', 'DISPATCHED', 'Despachado con remitos: ' || (
        SELECT string_agg(r.document_number, ', ' ORDER BY r.document_position) FROM public.order_remittances r
        WHERE r.batch_id = v_batch_id AND EXISTS (SELECT 1 FROM public.order_remittance_lines l
          JOIN public.order_remittance_line_sources s ON s.line_id = l.id WHERE l.remittance_id = r.id AND s.order_id = v_child.id)
      ), p_actor_id, v_now);
  END LOOP;
  IF v_standalone THEN
    -- The root was dispatched above. Its unassigned commercial items are now
    -- documented, not pending shipments; do not restore its old PREPARING status.
    v_new_status := 'DISPATCHED';
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.quote_items q WHERE q.quote_id = v_parent.quote_id
      AND q.assigned_order_id IS NULL) INTO v_has_unassigned;
    IF v_has_unassigned THEN
      v_new_status := CASE WHEN v_parent.status::text IN (
        'STOCK_OK', 'PURCHASE_REQUIRED', 'PURCHASING', 'GOODS_RECEIVED', 'STOCK_RESERVED',
        'IN_PRODUCTION', 'DESIGN_REVIEW', 'PREPARING', 'DISPATCHED', 'DELIVERED'
      ) THEN v_parent.status ELSE 'PENDING_STOCK'::public.order_flow_status END;
    ELSE
      SELECT o.status INTO STRICT v_new_status FROM public.orders o
        WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_order_id
          AND o.status::text NOT IN ('DELIVERED', 'CANCELLED')
        ORDER BY CASE o.status::text
          WHEN 'PENDING_FINANCE' THEN 0 WHEN 'FINANCE_REJECTED' THEN 0 WHEN 'STOCK_OK' THEN 0
          WHEN 'STOCK_RESERVED' THEN 1 WHEN 'PURCHASE_REQUIRED' THEN 1 WHEN 'PURCHASING' THEN 2
          WHEN 'GOODS_RECEIVED' THEN 3 WHEN 'PENDING_STOCK' THEN 4 WHEN 'IN_PRODUCTION' THEN 5
          WHEN 'DESIGN_REVIEW' THEN 6 WHEN 'PREPARING' THEN 7 WHEN 'DISPATCHED' THEN 8 ELSE 99 END, o.id LIMIT 1;
      IF v_new_status::text = 'PURCHASE_REQUIRED' AND EXISTS (SELECT 1 FROM public.orders o
        WHERE o.organization_id = p_org_id AND o.parent_order_id = p_parent_order_id AND o.status = 'GOODS_RECEIVED') THEN
        v_new_status := 'GOODS_RECEIVED';
      END IF;
    END IF;
    IF v_parent.status IS DISTINCT FROM v_new_status THEN
      UPDATE public.orders SET status = v_new_status, updated_at = v_now WHERE id = p_parent_order_id AND organization_id = p_org_id;
      INSERT INTO public.order_status_history (order_id, from_status, to_status, notes, changed_by, changed_at)
        VALUES (p_parent_order_id, v_parent.status, v_new_status, 'Recalculado automáticamente por despacho documentado', p_actor_id, v_now);
    END IF;
  END IF;
  IF v_parent.sales_order_id IS NOT NULL AND v_new_status::text = 'DISPATCHED' AND v_sale.status::text = 'CONFIRMED' THEN
    UPDATE public.sales_orders SET status = 'DISPATCH', dispatched_at = v_now, updated_at = v_now
      WHERE id = v_sale.id AND organization_id = p_org_id;
    v_requires_fiscal := public.organization_uses_invoice_backed_debt(p_org_id)
      AND v_sale.invoice_type::text IS DISTINCT FROM 'NOTA_DE_VENTA';
    IF NOT v_requires_fiscal AND v_sale.customer_id IS NOT NULL THEN
      INSERT INTO public.accounts_receivable (organization_id, customer_id, sales_order_id, total_amount,
        pending_balance, currency, due_date, status)
        SELECT p_org_id, v_sale.customer_id, v_sale.id, trunc(coalesce(v_sale.total_amount, 0), 2),
          trunc(coalesce(v_sale.total_amount, 0), 2), coalesce(v_sale.currency, 'ARS'),
          (v_now AT TIME ZONE 'UTC')::date + coalesce(v_sale.credit_days, 0), 'PENDING'::public.receivable_status
        WHERE NOT EXISTS (SELECT 1 FROM public.accounts_receivable a
          WHERE a.organization_id = p_org_id AND a.sales_order_id = v_sale.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
    FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
END;
$$;

-- The old guard skipped NULL assignments. Standalone sources also need to be
-- protected from later assignment to a child while their remittance is active.
CREATE OR REPLACE FUNCTION public.guard_documented_quote_item_reassignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_source record;
  v_org_id uuid;
BEGIN
  IF NEW.assigned_order_id IS NOT DISTINCT FROM OLD.assigned_order_id THEN RETURN NEW; END IF;
  SELECT q.organization_id INTO STRICT v_org_id FROM public.quotes q WHERE q.id = OLD.quote_id;
  PERFORM 1 FROM public.organizations WHERE id = v_org_id FOR UPDATE NOWAIT;
  FOR v_source IN
    SELECT DISTINCT s.organization_id, s.order_id FROM public.order_remittance_line_sources s
    JOIN public.order_remittance_lines l ON l.id = s.line_id AND l.organization_id = s.organization_id
    JOIN public.order_remittances r ON r.id = l.remittance_id AND r.organization_id = l.organization_id
    WHERE s.quote_item_id = OLD.id AND r.status = 'ISSUED'
  LOOP
    PERFORM public.assert_order_has_no_issued_remittances(v_source.organization_id, v_source.order_id);
  END LOOP;
  IF OLD.assigned_order_id IS NOT NULL THEN
    SELECT o.organization_id INTO STRICT v_org_id FROM public.orders o WHERE o.id = OLD.assigned_order_id;
    PERFORM public.assert_order_has_no_issued_remittances(v_org_id, OLD.assigned_order_id);
  END IF;
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE preserves the private ACLs and the guarded public wrapper.
COMMIT;
