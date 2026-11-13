-- Fase 2: primitivas privadas para el servidor. No activa el flujo nuevo.
-- commit_order_remittance_documents NO cambia estados operativos ni stock.
-- Se invocará desde la confirmación de despacho, en su misma transacción.
BEGIN;

-- 0046 y 00046 no pueden representar dos documentos distintos.
CREATE FUNCTION public.order_remittance_number_key(p_number text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT CASE WHEN btrim(p_number) ~ '[0-9]+$' THEN
    upper(regexp_replace(btrim(p_number), '[0-9]+$', '')) || '#' ||
    coalesce(nullif(ltrim(substring(btrim(p_number) FROM '([0-9]+)$'), '0'), ''), '0')
  ELSE upper(btrim(p_number)) END;
$$;

CREATE UNIQUE INDEX order_remittances_normalized_number_unique
  ON public.order_remittances
  (organization_id, public.order_remittance_number_key(document_number));

-- Las cantidades no se fraccionan entre documentos en esta primera versión:
-- cada ítem de origen completo aparece una sola vez dentro del lote documental.
-- Se verifica en la función porque la relación atraviesa tres tablas.

-- Huella de las fuentes comerciales. Privada: la usa el servidor al preparar
-- el plan y nuevamente bajo bloqueos al confirmarlo.
CREATE FUNCTION public.order_remittance_source_fingerprint(
  p_org_id uuid, p_order_ids uuid[]
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH selected_orders AS (
    SELECT o.* FROM public.orders o
    WHERE o.organization_id = p_org_id AND o.id = ANY(p_order_ids)
  ), selected_items AS (
    SELECT q.* FROM public.quote_items q
    JOIN selected_orders o ON o.id = q.assigned_order_id
  )
  SELECT md5(jsonb_build_object(
    'orders', (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM selected_orders o),
    'quotes', (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id)
      FROM public.quotes q WHERE q.id IN (SELECT quote_id FROM selected_orders)),
    'customers', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
      FROM public.customers c WHERE c.organization_id = p_org_id AND c.id IN
        (SELECT q.customer_id FROM public.quotes q WHERE q.id IN (SELECT quote_id FROM selected_orders))),
    'issuer', (SELECT to_jsonb(o) - 'remittance_last_number' - 'updated_at'
      FROM public.organizations o WHERE o.id = p_org_id),
    'settings', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.organization_id)
      FROM public.organization_settings s WHERE s.organization_id = p_org_id),
    'items', (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM selected_items q),
    'extras', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM public.quote_item_extras e WHERE e.quote_item_id IN (SELECT id FROM selected_items)),
    'sale_items', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
      FROM public.sales_order_items s WHERE s.organization_id = p_org_id
        AND s.quote_item_id IN (SELECT id FROM selected_items)),
    'products', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
      FROM public.products p WHERE p.organization_id = p_org_id
        AND p.id IN (SELECT product_id FROM selected_items)),
    'variants', (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id)
      FROM public.product_variants v WHERE v.organization_id = p_org_id
        AND v.id IN (SELECT product_variant_id FROM selected_items))
  )::text);
$$;

CREATE FUNCTION public.commit_order_remittance_documents(
  p_org_id uuid,
  p_actor_id uuid,
  p_parent_order_id uuid,
  p_order_ids uuid[],
  p_idempotency_key uuid,
  p_expected_source_fingerprint text,
  p_automatic_numbering boolean,
  p_documents jsonb
) RETURNS TABLE (
  batch_id uuid,
  remittance_id uuid,
  document_number text,
  document_position integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
  v_ids uuid[];
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
     OR coalesce(cardinality(p_order_ids), 0) = 0
     OR array_position(p_order_ids, NULL) IS NOT NULL
     OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Solicitud de remitos inválida'; END IF;
  IF jsonb_array_length(p_documents) = 0 THEN
    RAISE EXCEPTION 'El despacho necesita al menos un remito';
  END IF;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_order_ids) x;
  IF cardinality(v_ids) <> cardinality(p_order_ids) THEN
    RAISE EXCEPTION 'La selección contiene subpedidos repetidos';
  END IF;

  -- Orden de bloqueos compartido con la protección de números históricos:
  -- organización -> padre -> subpedidos -> fuentes.
  SELECT * INTO STRICT v_org FROM public.organizations
  WHERE id = p_org_id FOR UPDATE;

  SELECT m.is_owner INTO v_owner FROM public.organization_members m
  WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(array_agg(DISTINCT p.key), '{}'::text[]) INTO v_permissions
  FROM public.organization_members m
  JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active;
  v_all := coalesce(v_owner, false) OR 'organization.admin' = ANY(v_permissions)
    OR 'orders.manage.all' = ANY(v_permissions) OR 'orders.read.all' = ANY(v_permissions);
  IF NOT (coalesce(v_owner, false) OR 'organization.admin' = ANY(v_permissions)
      OR 'orders.dispatch' = ANY(v_permissions)) THEN
    RAISE EXCEPTION 'Sin permiso para despachar' USING ERRCODE = '42501';
  END IF;

  v_request_fingerprint := md5(jsonb_build_object(
    'parent', p_parent_order_id, 'orders', v_ids, 'actor', p_actor_id,
    'source', p_expected_source_fingerprint,
    'automatic', p_automatic_numbering, 'documents', p_documents
  )::text);
  SELECT * INTO v_existing FROM public.order_remittance_batches b
  WHERE b.organization_id = p_org_id AND b.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RAISE EXCEPTION 'La clave de confirmación ya corresponde a otra solicitud';
    END IF;
    RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
      FROM public.order_remittances r WHERE r.batch_id = v_existing.id
      ORDER BY r.document_position;
    RETURN;
  END IF;

  SELECT * INTO STRICT v_parent FROM public.orders o
  WHERE o.id = p_parent_order_id AND o.organization_id = p_org_id FOR UPDATE;
  IF v_parent.parent_order_id IS NOT NULL THEN RAISE EXCEPTION 'Se esperaba un pedido padre'; END IF;
  IF NOT v_all AND v_parent.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Pedido fuera del alcance del usuario' USING ERRCODE = '42501';
  END IF;
  PERFORM o.id FROM public.orders o
  WHERE o.organization_id = p_org_id AND o.id = ANY(v_ids) ORDER BY o.id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.orders o
  WHERE o.organization_id = p_org_id AND o.id = ANY(v_ids)
    AND o.parent_order_id = p_parent_order_id AND o.quote_id = v_parent.quote_id
    AND o.status = 'PREPARING' AND (v_all OR o.created_by = p_actor_id);
  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Los subpedidos cambiaron, no están en preparación o no son accesibles';
  END IF;

  PERFORM q.id FROM public.quote_items q
  WHERE q.assigned_order_id = ANY(v_ids) ORDER BY q.id FOR UPDATE;
  PERFORM q.id FROM public.quotes q WHERE q.id = v_parent.quote_id FOR SHARE;
  PERFORM c.id FROM public.customers c WHERE c.organization_id = p_org_id
    AND c.id IN (SELECT q.customer_id FROM public.quotes q WHERE q.id = v_parent.quote_id)
    FOR SHARE;
  PERFORM s.organization_id FROM public.organization_settings s
    WHERE s.organization_id = p_org_id FOR SHARE;
  -- Bloquea también datos utilizados al calcular agrupación e importes.
  PERFORM e.id FROM public.quote_item_extras e
  WHERE e.quote_item_id IN (SELECT q.id FROM public.quote_items q WHERE q.assigned_order_id = ANY(v_ids))
  ORDER BY e.id FOR SHARE;
  PERFORM s.id FROM public.sales_order_items s
  WHERE s.organization_id = p_org_id AND s.quote_item_id IN
    (SELECT q.id FROM public.quote_items q WHERE q.assigned_order_id = ANY(v_ids))
  ORDER BY s.id FOR SHARE;
  PERFORM p.id FROM public.products p WHERE p.organization_id = p_org_id
    AND p.id IN (SELECT q.product_id FROM public.quote_items q WHERE q.assigned_order_id = ANY(v_ids))
    ORDER BY p.id FOR SHARE;
  PERFORM v.id FROM public.product_variants v WHERE v.organization_id = p_org_id
    AND v.id IN (SELECT q.product_variant_id FROM public.quote_items q WHERE q.assigned_order_id = ANY(v_ids))
    ORDER BY v.id FOR SHARE;
  IF public.order_remittance_source_fingerprint(p_org_id, v_ids)
      IS DISTINCT FROM p_expected_source_fingerprint THEN
    RAISE EXCEPTION 'Cambió el contenido del despacho; actualizá la vista previa';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_remittance_line_sources s
    JOIN public.order_remittance_lines l ON l.id = s.line_id
    JOIN public.order_remittances r ON r.id = l.remittance_id
    WHERE s.organization_id = p_org_id AND s.order_id = ANY(v_ids) AND r.status = 'ISSUED'
  ) OR EXISTS (
    SELECT 1 FROM public.order_dispatch_events e WHERE e.order_id = ANY(v_ids)
  ) THEN RAISE EXCEPTION 'Un subpedido ya tiene documentación de despacho; requiere revisión'; END IF;

  IF p_automatic_numbering AND NOT coalesce(v_org.remittance_auto_enabled, false) THEN
    RAISE EXCEPTION 'La numeración automática no está habilitada';
  END IF;
  v_counter := coalesce(v_org.remittance_last_number, 0);
  INSERT INTO public.order_remittance_batches (
    id, organization_id, parent_order_id, dispatch_group_id,
    idempotency_key, request_fingerprint, created_by
  ) VALUES (v_batch_id, p_org_id, p_parent_order_id, v_group_id,
    p_idempotency_key, v_request_fingerprint, p_actor_id);

  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    v_doc_index := v_doc_index + 1;
    IF jsonb_typeof(v_doc) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_doc->'lines') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_doc->'header_snapshot') IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'Documento inválido'; END IF;
    v_count := jsonb_array_length(v_doc->'lines');
    IF v_count NOT BETWEEN 1 AND 26
       OR (v_doc_index < jsonb_array_length(p_documents) AND v_count <> 26) THEN
      RAISE EXCEPTION 'La distribución debe completar bloques de 26 líneas salvo el último';
    END IF;
    v_number := nullif(btrim(v_doc->>'document_number'), '');
    IF p_automatic_numbering AND v_number IS NOT NULL THEN
      RAISE EXCEPTION 'No se deben enviar números definitivos en modo automático';
    END IF;
    LOOP
      IF p_automatic_numbering THEN
        v_counter := v_counter + 1;
        v_number := CASE WHEN nullif(v_org.remittance_prefix, '') IS NULL THEN ''
          ELSE v_org.remittance_prefix || '-' END
          || CASE WHEN length(v_counter::text) < 5 THEN lpad(v_counter::text, 5, '0')
                  ELSE v_counter::text END;
      ELSIF v_number IS NULL THEN RAISE EXCEPTION 'Falta el número manual de un remito'; END IF;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.order_remittances r WHERE r.organization_id = p_org_id
          AND public.order_remittance_number_key(r.document_number) = public.order_remittance_number_key(v_number)
        UNION ALL
        SELECT 1 FROM public.order_dispatch_events e JOIN public.orders o ON o.id = e.order_id
          WHERE o.organization_id = p_org_id
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
    -- Cabecera provisional no visible fuera de esta transacción.
    INSERT INTO public.order_remittances (
      id, organization_id, batch_id, document_number, document_position,
      issue_date, package_count, declared_value, subtotal, discount_total,
      total, currency, header_snapshot
    ) VALUES (
      v_document_id, p_org_id, v_batch_id, v_number, v_doc_index,
      (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      (v_doc->>'package_count')::integer, (v_doc->>'declared_value')::numeric,
      0, 0, 0, v_doc->>'currency', v_doc->'header_snapshot'
    );
    IF (v_doc->>'package_count')::numeric IS DISTINCT FROM (v_doc->>'package_count')::integer::numeric
       OR (v_doc->>'declared_value')::numeric IS DISTINCT FROM trunc((v_doc->>'declared_value')::numeric, 2)
    THEN RAISE EXCEPTION 'Bultos o valor declarado tienen una precisión inválida'; END IF;
    v_line_index := 0;
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_doc->'lines') LOOP
      v_line_index := v_line_index + 1;
      IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
        OR jsonb_typeof(v_line->'sources') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'Línea inválida'; END IF;
      IF jsonb_array_length(v_line->'sources') = 0 THEN RAISE EXCEPTION 'Línea sin orígenes'; END IF;
      IF (v_line->>'quantity')::numeric IS DISTINCT FROM trunc((v_line->>'quantity')::numeric, 6)
        OR (v_line->>'weight_quantity')::numeric IS DISTINCT FROM trunc((v_line->>'weight_quantity')::numeric, 6)
        OR (v_line->>'unit_price')::numeric IS DISTINCT FROM trunc((v_line->>'unit_price')::numeric, 6)
        OR (v_line->>'subtotal')::numeric IS DISTINCT FROM trunc((v_line->>'subtotal')::numeric, 6)
        OR (v_line->>'discount_percentage')::numeric IS DISTINCT FROM trunc((v_line->>'discount_percentage')::numeric, 4)
      THEN RAISE EXCEPTION 'La precisión de una línea excede la soportada por el documento'; END IF;
      v_line_id := gen_random_uuid();
      INSERT INTO public.order_remittance_lines (
        id, organization_id, remittance_id, line_position, product_id,
        product_variant_id, sku, product_name, brand, variant_name,
        unit_of_measure, quantity, weight_quantity, unit_price, subtotal,
        discount_percentage, extras_snapshot
      ) VALUES (
        v_line_id, p_org_id, v_document_id, v_line_index,
        (v_line->>'product_id')::uuid, (v_line->>'product_variant_id')::uuid,
        v_line->>'sku', v_line->>'product_name', v_line->>'brand', v_line->>'variant_name',
        (v_line->>'unit_of_measure')::public.unit_of_measure_type,
        (v_line->>'quantity')::numeric, (v_line->>'weight_quantity')::numeric,
        (v_line->>'unit_price')::numeric, (v_line->>'subtotal')::numeric,
        (v_line->>'discount_percentage')::numeric, coalesce(v_line->'extras_snapshot', '[]'::jsonb)
      );
      v_line_qty := 0;
      FOR v_source IN SELECT value FROM jsonb_array_elements(v_line->'sources') LOOP
        SELECT * INTO STRICT v_item FROM public.quote_items q
          WHERE q.id = (v_source->>'quote_item_id')::uuid;
        v_source_qty := (v_source->>'quantity')::numeric;
        IF v_item.id = ANY(v_seen)
          OR NOT coalesce(v_item.assigned_order_id = ANY(v_ids), false)
          OR v_item.assigned_order_id IS DISTINCT FROM (v_source->>'order_id')::uuid
          OR v_item.quote_id IS DISTINCT FROM v_parent.quote_id
          OR v_item.quantity IS DISTINCT FROM v_source_qty
          OR v_source_qty <= 0 OR v_source_qty = 'NaN'::numeric
          OR v_source_qty IS DISTINCT FROM trunc(v_source_qty, 6)
          OR v_item.product_id IS DISTINCT FROM (v_line->>'product_id')::uuid
          OR v_item.product_variant_id IS DISTINCT FROM (v_line->>'product_variant_id')::uuid
        THEN RAISE EXCEPTION 'Origen duplicado, modificado o fuera del despacho'; END IF;
        v_seen := array_append(v_seen, v_item.id);
        v_line_qty := v_line_qty + v_source_qty;
        INSERT INTO public.order_remittance_line_sources (
          organization_id, line_id, order_id, quote_item_id, quantity
        ) VALUES (p_org_id, v_line_id, v_item.assigned_order_id, v_item.id, v_source_qty);
      END LOOP;
      IF v_line_qty IS DISTINCT FROM (v_line->>'quantity')::numeric THEN
        RAISE EXCEPTION 'La cantidad impresa no coincide con sus orígenes';
      END IF;
      v_subtotal := v_subtotal + (v_line->>'subtotal')::numeric;
      v_discount := v_discount + (v_line->>'subtotal')::numeric
        * coalesce((v_line->>'discount_percentage')::numeric, 0) / 100;
    END LOOP;
    UPDATE public.order_remittances r
      SET subtotal = trunc(v_subtotal, 2), discount_total = trunc(v_discount, 2),
          total = trunc(v_subtotal, 2) - trunc(v_discount, 2)
      WHERE r.id = v_document_id;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.quote_items q WHERE q.assigned_order_id = ANY(v_ids);
  IF v_count = 0 OR v_count <> cardinality(v_seen) THEN
    RAISE EXCEPTION 'La distribución omite ítems del despacho';
  END IF;
  IF p_automatic_numbering THEN
    UPDATE public.organizations SET remittance_last_number = v_counter WHERE id = p_org_id;
  END IF;
  RETURN QUERY SELECT r.batch_id, r.id, r.document_number, r.document_position
    FROM public.order_remittances r WHERE r.batch_id = v_batch_id ORDER BY r.document_position;
END;
$function$;

-- Los caminos históricos también deben tomar el bloqueo de organización:
-- así no pueden ocupar un número entre la validación y el commit nuevos.
-- Se permiten los eventos del mismo lote documental, con grupo y origen válidos.
CREATE FUNCTION public.guard_legacy_remittance_document_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_number text;
  v_document_id uuid;
  v_group_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'order_dispatch_events' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.order_id IS NOT DISTINCT FROM OLD.order_id
        AND NEW.remito_number IS NOT DISTINCT FROM OLD.remito_number
        AND NEW.dispatch_group_id IS NOT DISTINCT FROM OLD.dispatch_group_id THEN RETURN NEW; END IF;
    END IF;
    SELECT o.organization_id INTO STRICT v_org_id FROM public.orders o WHERE o.id = NEW.order_id;
    v_number := NEW.remito_number;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
        AND NEW.remittance_number IS NOT DISTINCT FROM OLD.remittance_number THEN RETURN NEW; END IF;
    END IF;
    v_org_id := NEW.organization_id;
    v_number := NEW.remittance_number;
  END IF;
  IF nullif(btrim(v_number), '') IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.organizations WHERE id = v_org_id FOR UPDATE;
  SELECT r.id, b.dispatch_group_id INTO v_document_id, v_group_id
  FROM public.order_remittances r
  JOIN public.order_remittance_batches b ON b.id = r.batch_id
  WHERE r.organization_id = v_org_id
    AND public.order_remittance_number_key(r.document_number) = public.order_remittance_number_key(v_number);
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'order_dispatch_events' THEN
    IF NEW.dispatch_group_id IS NOT DISTINCT FROM v_group_id AND EXISTS (
      SELECT 1 FROM public.order_remittance_line_sources s
      JOIN public.order_remittance_lines l ON l.id = s.line_id
      WHERE l.remittance_id = v_document_id AND s.order_id = NEW.order_id
        AND s.organization_id = v_org_id
    ) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'El número % pertenece a un remito documental y no puede reutilizarse', v_number
    USING ERRCODE = '23505';
END;
$$;

CREATE TRIGGER order_dispatch_events_document_number_guard
BEFORE INSERT OR UPDATE OF order_id, remito_number, dispatch_group_id
ON public.order_dispatch_events FOR EACH ROW
EXECUTE FUNCTION public.guard_legacy_remittance_document_number();

CREATE TRIGGER sales_orders_document_number_guard
BEFORE INSERT OR UPDATE OF organization_id, remittance_number
ON public.sales_orders FOR EACH ROW
EXECUTE FUNCTION public.guard_legacy_remittance_document_number();

REVOKE ALL ON FUNCTION public.guard_legacy_remittance_document_number() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.order_remittance_number_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_remittance_number_key(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.order_remittance_source_fingerprint(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_remittance_source_fingerprint(uuid, uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_order_remittance_documents(uuid, uuid, uuid, uuid[], uuid, text, boolean, jsonb)
  TO service_role;

COMMIT;
