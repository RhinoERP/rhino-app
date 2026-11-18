-- Phase 2: private transactional commercial writer. Only the trusted server
-- may submit its priced/taxed/allocated plan. No payment, cash session, ARCA
-- request or receivable is part of this transaction. Staging RLS stays closed.
BEGIN;

ALTER TABLE public.sales_orders ADD COLUMN marketplace_request_fingerprint text;
ALTER TABLE public.stock_movements ADD COLUMN mercadolibre_sale_item_id uuid
  REFERENCES public.sales_order_items(id) ON DELETE RESTRICT;
CREATE INDEX stock_movements_meli_sale_item_idx
  ON public.stock_movements (mercadolibre_sale_item_id)
  WHERE mercadolibre_sale_item_id IS NOT NULL;

CREATE FUNCTION public.commit_mercadolibre_sale(
  p_org_id uuid, p_actor_id uuid, p_idempotency_key uuid, p_payload jsonb
) RETURNS TABLE (sale_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_member public.organization_members%ROWTYPE;
  v_admin boolean;
  v_warehouse uuid;
  v_sale public.sales_orders%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_lot public.product_lots%ROWTYPE;
  v_tax public.taxes%ROWTYPE;
  v_item jsonb;
  v_allocation jsonb;
  v_item_tax jsonb;
  v_item_id uuid;
  v_quantity numeric;
  v_weight numeric;
  v_price numeric;
  v_base_price numeric;
  v_discount numeric;
  v_net numeric;
  v_gross numeric;
  v_base_required numeric;
  v_units_required numeric;
  v_allocated numeric;
  v_allocated_units numeric;
  v_out numeric;
  v_out_units numeric;
  v_tax_base numeric;
  v_tax_amount numeric;
  v_tax_rate numeric;
  v_total_gross numeric := 0;
  v_total_net numeric := 0;
  v_total_tax numeric := 0;
  v_global_discount numeric;
  v_total numeric;
  v_measured boolean;
  v_tracks_units boolean;
  v_currency text;
  v_fingerprint text;
  v_order_number text;
  v_sale_date date;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'La confirmación Meli requiere el servicio autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_idempotency_key IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Solicitud de venta Meli inválida';
  END IF;
  IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'La venta requiere entre 1 y 500 líneas';
  END IF;

  SELECT * INTO v_member FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_actor_id AND is_active
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  v_admin := v_member.is_owner OR EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.id = v_member.role_id AND r.organization_id = p_org_id
      AND p.key = 'organization.admin'
  );
  IF NOT v_admin AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.id = v_member.role_id AND r.organization_id = p_org_id
      AND p.key = 'mercadolibre.manage'
  ) THEN RAISE EXCEPTION 'Sin permiso para registrar ventas Meli' USING ERRCODE = '42501'; END IF;

  -- Serialize identical attempts before inspecting stock or current settings.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-sale:' || p_org_id::text || ':' || p_idempotency_key::text, 0
  ));
  -- Stock allocation is an execution detail: a retry may recompute FIFO after
  -- the original commit. The commercial intent must still be identical.
  v_fingerprint := md5(jsonb_set(p_payload, '{items}', (
    SELECT jsonb_agg(i.value - 'allocations' ORDER BY i.ordinality)
    FROM jsonb_array_elements(p_payload->'items') WITH ORDINALITY i
  ))::text);
  SELECT * INTO v_sale FROM public.sales_orders
    WHERE organization_id = p_org_id AND sales_channel = 'MERCADO_LIBRE'
      AND marketplace_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_sale.user_id IS DISTINCT FROM p_actor_id
      OR v_sale.marketplace_request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'La clave de confirmación ya corresponde a otra solicitud';
    END IF;
    RETURN QUERY SELECT v_sale.id, true;
    RETURN;
  END IF;

  v_order_number := btrim(p_payload->>'marketplace_order_number');
  v_currency := p_payload->>'currency';
  v_sale_date := (p_payload->>'sale_date')::date;
  IF coalesce(length(v_order_number), 0) NOT BETWEEN 1 AND 120
    OR v_currency IS NULL OR v_currency NOT IN ('ARS', 'USD')
    OR v_sale_date IS NULL
    OR coalesce(p_payload->>'invoice_type', '') NOT IN ('FACTURA_A', 'FACTURA_B', 'FACTURA_C')
    OR NOT public.is_valid_meli_fiscal_receiver(p_payload->'receiver') THEN
    RAISE EXCEPTION 'Orden, moneda, fecha, comprobante o comprador inválidos';
  END IF;
  IF p_payload->>'invoice_type' = 'FACTURA_A'
    AND p_payload->'receiver'->>'tax_condition' <> 'RESPONSABLE_INSCRIPTO' THEN
    RAISE EXCEPTION 'Factura A requiere un receptor responsable inscripto';
  END IF;
  IF v_currency = 'USD' AND (
    coalesce((p_payload->>'commercial_exchange_rate')::numeric, 0) <= 0
    OR (p_payload->>'commercial_exchange_rate')::numeric::text IN ('NaN', 'Infinity', '-Infinity')
  ) THEN RAISE EXCEPTION 'La venta USD requiere una cotización comercial válida'; END IF;

  SELECT warehouse_id INTO v_warehouse FROM public.mercadolibre_settings
    WHERE organization_id = p_org_id FOR SHARE;
  IF NOT FOUND OR v_warehouse IS DISTINCT FROM (p_payload->>'warehouse_id')::uuid THEN
    RAISE EXCEPTION 'Cambió el depósito configurado; actualizá la venta';
  END IF;
  PERFORM 1 FROM public.warehouses
    WHERE id = v_warehouse AND organization_id = p_org_id
      AND is_active AND direct_sale_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Depósito Meli no disponible'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments
      WHERE organization_id = p_org_id AND warehouse_id = v_warehouse
        AND user_id = p_actor_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  IF nullif(p_payload->>'customer_id', '') IS NOT NULL THEN
    PERFORM 1 FROM public.customers
      WHERE id = (p_payload->>'customer_id')::uuid AND organization_id = p_org_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente ajeno a la organización'; END IF;
  END IF;

  -- Lock all selected lots in one deterministic order. Availability is checked
  -- again below using these locked rows, including repeated products/lines.
  PERFORM l.id FROM public.product_lots l
    WHERE l.organization_id = p_org_id AND l.warehouse_id = v_warehouse
      AND l.id IN (
        SELECT (a.value->>'lot_id')::uuid
        FROM jsonb_array_elements(p_payload->'items') i
        CROSS JOIN LATERAL jsonb_array_elements(i.value->'allocations') a
      ) ORDER BY l.id FOR UPDATE;

  INSERT INTO public.sales_orders (
    organization_id, user_id, created_by, customer_id, warehouse_id,
    sales_channel, marketplace_order_number, marketplace_idempotency_key,
    marketplace_request_fingerprint, fiscal_receiver_snapshot,
    status, document_type, invoice_type, sale_date, currency,
    commercial_exchange_rate, sub_total, total_tax_amount, total_amount,
    confirmed_at, dispatched_at, delivered_at, observations
  ) VALUES (
    p_org_id, p_actor_id, p_actor_id, nullif(p_payload->>'customer_id', '')::uuid, v_warehouse,
    'MERCADO_LIBRE', v_order_number, p_idempotency_key,
    v_fingerprint, p_payload->'receiver',
    'DELIVERED', 'STANDARD', (p_payload->>'invoice_type')::public.invoice_type,
    v_sale_date, v_currency,
    CASE WHEN v_currency = 'USD' THEN (p_payload->>'commercial_exchange_rate')::numeric ELSE NULL END,
    0, 0, 0, v_now, v_now, v_now, nullif(btrim(p_payload->>'observations'), '')
  ) RETURNING * INTO v_sale;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'product_id')::uuid AND organization_id = p_org_id AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto inactivo o ajeno a la organización'; END IF;
    IF coalesce(v_product.has_variants, false) THEN
      SELECT * INTO v_variant FROM public.product_variants
        WHERE id = nullif(v_item->>'product_variant_id', '')::uuid
          AND product_id = v_product.id AND organization_id = p_org_id AND is_active FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Seleccioná una variante activa del producto'; END IF;
    ELSIF nullif(v_item->>'product_variant_id', '') IS NOT NULL THEN
      RAISE EXCEPTION 'El producto no admite variantes';
    END IF;
    v_quantity := (v_item->>'quantity')::numeric;
    v_weight := nullif(v_item->>'unit_quantity', '')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_base_price := (v_item->>'base_price')::numeric;
    v_discount := coalesce((v_item->>'discount_amount')::numeric, 0);
    v_net := (v_item->>'subtotal')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity <> trunc(v_quantity, 6)
      OR v_price IS NULL OR v_price < 0 OR v_price <> trunc(v_price, 2)
      OR v_base_price IS NULL OR v_base_price < 0 OR v_base_price <> trunc(v_base_price, 2)
      OR v_discount < 0 OR v_discount <> trunc(v_discount, 2)
      OR v_net IS NULL OR v_net < 0 OR v_net <> trunc(v_net, 2)
      OR v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_price::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_base_price::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_discount::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_net::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Cantidades o precios inválidos';
    END IF;
    v_measured := coalesce(v_product.unit_of_measure::text IN ('KG', 'LT'), false);
    v_tracks_units := v_measured AND coalesce(v_product.tracks_stock_units, false);
    IF v_weight IS NOT NULL AND (
      NOT v_measured OR v_weight <= 0 OR v_weight <> trunc(v_weight, 6)
      OR v_weight::text IN ('NaN', 'Infinity', '-Infinity')
    ) THEN RAISE EXCEPTION 'Peso o volumen inválido para el producto'; END IF;
    IF (coalesce(v_product.has_variants, false) OR v_tracks_units OR v_product.unit_of_measure::text = 'UN')
      AND trunc(v_quantity) <> v_quantity THEN RAISE EXCEPTION 'Las unidades deben ser enteras'; END IF;
    IF v_tracks_units AND v_weight IS NULL THEN RAISE EXCEPTION 'Ingresá el peso o volumen de las piezas'; END IF;
    v_base_required := CASE WHEN v_measured THEN coalesce(v_weight, v_quantity) ELSE v_quantity END;
    v_units_required := CASE WHEN v_tracks_units THEN v_quantity ELSE 0 END;
    v_gross := trunc(v_base_required * v_price, 2);
    IF v_discount > v_gross OR v_net <> trunc(v_gross - v_discount, 2) THEN
      RAISE EXCEPTION 'El subtotal de la línea no coincide con su precio y descuento';
    END IF;

    INSERT INTO public.sales_order_items (
      organization_id, sales_order_id, product_id, product_variant_id,
      description, quantity, unit_quantity, unit_price, base_price,
      discount_amount, discount_percentage, subtotal, currency, is_adjustment
    ) VALUES (
      p_org_id, v_sale.id, v_product.id, nullif(v_item->>'product_variant_id', '')::uuid,
      v_product.name, v_quantity, v_weight, v_price, v_base_price,
      v_discount, CASE WHEN v_gross > 0 THEN trunc(100 * v_discount / v_gross, 4) ELSE 0 END,
      v_net, v_currency, false
    ) RETURNING id INTO v_item_id;

    IF jsonb_typeof(v_item->'allocations') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Falta la asignación de stock de la línea';
    END IF;
    IF jsonb_array_length(v_item->'allocations') NOT BETWEEN 1 AND 1000 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_item->'allocations') a
      GROUP BY a.value->>'lot_id' HAVING count(*) > 1
    ) THEN RAISE EXCEPTION 'Asignaciones de stock vacías, repetidas o excesivas'; END IF;
    v_allocated := 0;
    v_allocated_units := 0;
    FOR v_allocation IN SELECT value FROM jsonb_array_elements(v_item->'allocations') ORDER BY value->>'lot_id' LOOP
      v_out := (v_allocation->>'quantity')::numeric;
      v_out_units := coalesce((v_allocation->>'unit_quantity')::numeric, 0);
      IF v_out IS NULL OR v_out <= 0 OR v_out <> trunc(v_out, 6)
        OR v_out_units < 0 OR trunc(v_out_units) <> v_out_units
        OR v_out::text IN ('NaN', 'Infinity', '-Infinity')
        OR v_out_units::text IN ('NaN', 'Infinity', '-Infinity')
        OR (NOT v_tracks_units AND v_out_units <> 0) THEN
        RAISE EXCEPTION 'Consumo de lote inválido';
      END IF;
      SELECT * INTO v_lot FROM public.product_lots
        WHERE id = (v_allocation->>'lot_id')::uuid AND organization_id = p_org_id
          AND warehouse_id = v_warehouse AND product_id = v_product.id
          AND product_variant_id IS NOT DISTINCT FROM nullif(v_item->>'product_variant_id', '')::uuid
        FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Lote ajeno al depósito, producto o variante'; END IF;
      IF v_lot.quantity_available < v_out
        OR (v_tracks_units AND coalesce(v_lot.unit_quantity_available, 0) < v_out_units) THEN
        RAISE EXCEPTION 'Stock insuficiente; actualizá la disponibilidad';
      END IF;
      UPDATE public.product_lots SET
        quantity_available = quantity_available - v_out,
        unit_quantity_available = CASE WHEN v_tracks_units THEN unit_quantity_available - v_out_units ELSE unit_quantity_available END,
        updated_at = v_now WHERE id = v_lot.id;
      INSERT INTO public.stock_movements (
        organization_id, warehouse_id, lot_id, type, quantity,
        previous_stock, new_stock, unit_quantity, reason, created_by,
        source, mercadolibre_sale_item_id
      ) VALUES (
        p_org_id, v_warehouse, v_lot.id, 'OUTBOUND', v_out,
        v_lot.quantity_available, v_lot.quantity_available - v_out,
        CASE WHEN v_tracks_units THEN -v_out_units ELSE NULL END,
        'Venta Mercado Libre ' || coalesce(v_sale.sale_number::text, v_sale.id::text) || ' - Orden ' || v_order_number,
        p_actor_id, 'SYSTEM', v_item_id
      );
      v_allocated := v_allocated + v_out;
      v_allocated_units := v_allocated_units + v_out_units;
    END LOOP;
    IF v_allocated <> v_base_required OR v_allocated_units <> v_units_required THEN
      RAISE EXCEPTION 'La asignación de lotes no cubre exactamente la línea';
    END IF;

    IF jsonb_typeof(v_item->'taxes') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Falta el snapshot de impuestos de la línea';
    END IF;
    FOR v_item_tax IN SELECT value FROM jsonb_array_elements(v_item->'taxes') LOOP
      SELECT * INTO v_tax FROM public.taxes
        WHERE id = (v_item_tax->>'tax_id')::uuid AND organization_id = p_org_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Impuesto ajeno a la organización'; END IF;
      v_tax_base := (v_item_tax->>'base_amount')::numeric;
      v_tax_amount := (v_item_tax->>'tax_amount')::numeric;
      v_tax_rate := (v_item_tax->>'rate')::numeric;
      IF v_tax_base IS NULL OR v_tax_base < 0 OR v_tax_base <> trunc(v_tax_base, 2)
        OR v_tax_amount IS NULL OR v_tax_amount < 0 OR v_tax_amount <> trunc(v_tax_amount, 2)
        OR v_tax_rate IS NULL OR v_tax_rate < 0 OR v_tax_rate > 100
        OR v_tax_base::text IN ('NaN', 'Infinity', '-Infinity')
        OR v_tax_amount::text IN ('NaN', 'Infinity', '-Infinity')
        OR nullif(btrim(v_item_tax->>'name'), '') IS NULL
        OR nullif(btrim(v_item_tax->>'tax_code_snapshot'), '') IS NULL THEN
        RAISE EXCEPTION 'Snapshot de impuestos inválido';
      END IF;
      INSERT INTO public.sales_order_item_taxes (
        organization_id, sales_order_id, sales_order_item_id, product_id,
        tax_id, name, rate, base_amount, tax_amount, tax_code_snapshot, source
      ) VALUES (
        p_org_id, v_sale.id, v_item_id, v_product.id,
        v_tax.id, v_item_tax->>'name', v_tax_rate, v_tax_base, v_tax_amount,
        v_item_tax->>'tax_code_snapshot', 'product'
      );
      v_total_tax := v_total_tax + v_tax_amount;
    END LOOP;
    v_total_gross := v_total_gross + v_gross;
    v_total_net := v_total_net + v_net;
  END LOOP;

  v_global_discount := coalesce((p_payload->>'global_discount_amount')::numeric, 0);
  IF v_global_discount < 0 OR v_global_discount > v_total_net
    OR v_global_discount <> trunc(v_global_discount, 2)
    OR v_global_discount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Descuento global inválido';
  END IF;
  v_total := v_total_net - v_global_discount + v_total_tax;
  IF v_total <= 0 OR v_total IS DISTINCT FROM (p_payload->>'total_amount')::numeric THEN
    RAISE EXCEPTION 'El total comercial no coincide con las líneas e impuestos';
  END IF;
  INSERT INTO public.sales_order_taxes (
    organization_id, sales_order_id, tax_id, name, rate,
    base_amount, tax_amount, tax_code_snapshot
  ) SELECT p_org_id, v_sale.id, t.tax_id, t.name, t.rate,
      sum(t.base_amount), sum(t.tax_amount), t.tax_code_snapshot
    FROM public.sales_order_item_taxes t WHERE t.sales_order_id = v_sale.id
    GROUP BY t.tax_id, t.name, t.rate, t.tax_code_snapshot;
  UPDATE public.sales_orders SET sub_total = v_total_gross,
    global_discount_amount = v_global_discount,
    global_discount_percentage = CASE WHEN v_total_net > 0 THEN trunc(100 * v_global_discount / v_total_net, 4) ELSE 0 END,
    total_tax_amount = v_total_tax, total_amount = v_total,
    updated_at = v_now WHERE id = v_sale.id;

  RETURN QUERY SELECT v_sale.id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb)
  TO service_role;

COMMIT;
