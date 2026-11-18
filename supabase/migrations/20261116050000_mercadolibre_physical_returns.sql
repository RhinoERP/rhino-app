-- Physical receipts are independent of fiscal credits and money movements.
-- Reuse the warehouse reentry writer, but bound quantities to exact Meli outbounds.
BEGIN;

CREATE TABLE public.mercadolibre_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id),
  source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  return_date date NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  creation_txid bigint NOT NULL DEFAULT pg_catalog.txid_current(),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX mercadolibre_returns_sale ON public.mercadolibre_returns(organization_id, sales_order_id, received_at, id);

CREATE TABLE public.mercadolibre_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  return_id uuid NOT NULL REFERENCES public.mercadolibre_returns(id),
  sales_order_item_id uuid NOT NULL REFERENCES public.sales_order_items(id),
  source_movement_id uuid NOT NULL REFERENCES public.stock_movements(id),
  source_lot_id uuid NOT NULL REFERENCES public.product_lots(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_variant_id uuid REFERENCES public.product_variants(id),
  quantity numeric NOT NULL CHECK (quantity >= 0 AND quantity = trunc(quantity, 6) AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  unit_quantity numeric NOT NULL DEFAULT 0 CHECK (unit_quantity >= 0 AND unit_quantity = trunc(unit_quantity) AND unit_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  restock boolean NOT NULL,
  CHECK (quantity > 0 OR unit_quantity > 0),
  UNIQUE (return_id, source_movement_id)
);
CREATE INDEX mercadolibre_return_items_origin ON public.mercadolibre_return_items(organization_id, source_movement_id);

ALTER TABLE public.stock_movements ADD COLUMN mercadolibre_return_item_id uuid
  REFERENCES public.mercadolibre_return_items(id);
CREATE UNIQUE INDEX stock_movements_meli_return_item ON public.stock_movements(mercadolibre_return_item_id)
  WHERE mercadolibre_return_item_id IS NOT NULL;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_meli_return_inbound_check
  CHECK (mercadolibre_return_item_id IS NULL OR (type::text = 'INBOUND' AND mercadolibre_sale_item_id IS NULL));

ALTER TABLE public.mercadolibre_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadolibre_return_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_returns, public.mercadolibre_return_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mercadolibre_returns, public.mercadolibre_return_items TO service_role;

CREATE FUNCTION public.guard_meli_return_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_header public.mercadolibre_returns%ROWTYPE; v_origin public.stock_movements%ROWTYPE;
  v_item public.sales_order_items%ROWTYPE; v_received numeric; v_received_units numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Las devoluciones físicas Meli son documentos históricos y no se reemplazan';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'La devolución Meli requiere el servicio autorizado del canal';
  END IF;
  IF TG_TABLE_NAME = 'mercadolibre_returns' THEN
    NEW.creation_txid := pg_catalog.txid_current();
    PERFORM 1 FROM public.sales_orders s
      JOIN public.warehouses w ON w.id = NEW.warehouse_id AND w.organization_id = s.organization_id
      WHERE s.id = NEW.sales_order_id AND s.organization_id = NEW.organization_id
        AND s.sales_channel = 'MERCADO_LIBRE' AND s.warehouse_id = NEW.source_warehouse_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La devolución Meli no corresponde a la venta y depósitos de origen'; END IF;
  ELSE
    SELECT * INTO STRICT v_header FROM public.mercadolibre_returns WHERE id = NEW.return_id;
    IF v_header.creation_txid <> pg_catalog.txid_current() THEN
      RAISE EXCEPTION 'No se pueden agregar líneas a una recepción Meli ya confirmada';
    END IF;
    SELECT * INTO STRICT v_origin FROM public.stock_movements WHERE id = NEW.source_movement_id;
    SELECT * INTO STRICT v_item FROM public.sales_order_items WHERE id = NEW.sales_order_item_id;
    IF NEW.organization_id IS DISTINCT FROM v_header.organization_id
      OR v_origin.organization_id IS DISTINCT FROM v_header.organization_id
      OR v_item.organization_id IS DISTINCT FROM v_header.organization_id
      OR v_item.sales_order_id IS DISTINCT FROM v_header.sales_order_id
      OR v_origin.mercadolibre_sale_item_id IS DISTINCT FROM v_item.id
      OR v_origin.type::text <> 'OUTBOUND' OR v_origin.warehouse_id IS DISTINCT FROM v_header.source_warehouse_id
      OR NEW.source_lot_id IS DISTINCT FROM v_origin.lot_id
      OR NEW.product_id IS DISTINCT FROM v_item.product_id
      OR NEW.product_variant_id IS DISTINCT FROM v_item.product_variant_id THEN
      RAISE EXCEPTION 'La línea devuelta no coincide con su salida Meli original';
    END IF;
    PERFORM 1 FROM public.sales_orders WHERE id = v_header.sales_order_id
      AND organization_id = v_header.organization_id FOR UPDATE;
    IF v_origin.quantity IS NULL OR v_origin.quantity <= 0
      OR (v_origin.unit_quantity IS NULL AND NEW.unit_quantity <> 0)
      OR coalesce(v_origin.unit_quantity, 0) > 0 THEN
      RAISE EXCEPTION 'La salida original no tiene cantidades de stock válidas para devolver';
    END IF;
    SELECT coalesce(sum(quantity), 0), coalesce(sum(unit_quantity), 0)
      INTO v_received, v_received_units FROM public.mercadolibre_return_items
      WHERE organization_id = NEW.organization_id AND source_movement_id = NEW.source_movement_id;
    IF v_received + NEW.quantity > v_origin.quantity
      OR v_received_units + NEW.unit_quantity > abs(coalesce(v_origin.unit_quantity, 0)) THEN
      RAISE EXCEPTION 'La devolución supera la mercadería pendiente de recibir de esa salida';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mercadolibre_returns_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.mercadolibre_returns
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_return_document();
CREATE TRIGGER mercadolibre_return_items_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.mercadolibre_return_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_return_document();

CREATE FUNCTION public.guard_meli_return_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.mercadolibre_return_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'El reingreso físico Meli no puede modificarse ni compensarse fuera de su documento';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.mercadolibre_return_item_id IS NOT NULL THEN
    IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'El reingreso Meli requiere el servicio autorizado del canal';
    END IF;
    PERFORM 1 FROM public.mercadolibre_return_items i
      JOIN public.mercadolibre_returns r ON r.id = i.return_id AND r.organization_id = i.organization_id
      JOIN public.product_lots l ON l.id = NEW.lot_id AND l.organization_id = r.organization_id
      WHERE i.id = NEW.mercadolibre_return_item_id AND i.organization_id = NEW.organization_id AND i.restock
        AND NEW.type::text = 'INBOUND' AND NEW.source::text = 'RETURN'
        AND NEW.warehouse_id = r.warehouse_id AND l.warehouse_id = r.warehouse_id
        AND l.product_id = i.product_id AND l.product_variant_id IS NOT DISTINCT FROM i.product_variant_id
        AND NEW.quantity = i.quantity AND coalesce(NEW.unit_quantity, 0) = i.unit_quantity
        AND NEW.new_stock = NEW.previous_stock + i.quantity
        AND NEW.created_by = r.created_by AND NEW.reentry_source_lot_id = i.source_lot_id
        AND NEW.reentry_key = 'meli-return:' || r.id::text || ':' || i.source_movement_id::text
        AND NEW.reentry_reversed_at IS NULL AND NEW.reentry_reversal_movement_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento no coincide con la recepción física Meli'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movements_meli_return_guard BEFORE INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_return_movement();

CREATE FUNCTION public.check_meli_return_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'mercadolibre_returns' THEN
    PERFORM 1 FROM public.mercadolibre_return_items WHERE return_id = NEW.id AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La devolución Meli debe contener al menos una línea recibida'; END IF;
  ELSE
    IF NEW.restock IS DISTINCT FROM EXISTS (
      SELECT 1 FROM public.stock_movements m WHERE m.mercadolibre_return_item_id = NEW.id
        AND m.organization_id = NEW.organization_id
    ) THEN RAISE EXCEPTION 'La recepción física y su reingreso de stock deben confirmarse juntos'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER mercadolibre_return_complete AFTER INSERT ON public.mercadolibre_returns
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_meli_return_complete();
CREATE CONSTRAINT TRIGGER mercadolibre_return_item_complete AFTER INSERT ON public.mercadolibre_return_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_meli_return_complete();

CREATE FUNCTION public.commit_mercadolibre_return(p_org_id uuid, p_actor_id uuid, p_idempotency_key uuid, p_payload jsonb)
RETURNS TABLE (return_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_member public.organization_members%ROWTYPE; v_admin boolean;
  v_sale public.sales_orders%ROWTYPE; v_existing public.mercadolibre_returns%ROWTYPE;
  v_source_warehouse public.warehouses%ROWTYPE; v_destination uuid;
  v_origin public.stock_movements%ROWTYPE; v_item public.sales_order_items%ROWTYPE;
  v_product public.products%ROWTYPE; v_item_snapshot jsonb;
  v_line jsonb; v_lines jsonb; v_normalized jsonb; v_entries jsonb := '[]'::jsonb;
  v_quantity numeric; v_units numeric; v_returned numeric; v_returned_units numeric;
  v_restock boolean; v_fallback boolean; v_date date; v_reason text;
  v_id uuid := gen_random_uuid(); v_movements uuid[];
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'La devolución Meli requiere el servicio autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_idempotency_key IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_payload->'allow_default_fallback') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Solicitud de devolución Meli inválida';
  END IF;
  IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'La devolución requiere entre 1 y 500 salidas originales';
  END IF;
  SELECT * INTO v_member FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_actor_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  v_admin := v_member.is_owner OR EXISTS (
    SELECT 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE r.id = v_member.role_id AND r.organization_id = p_org_id AND p.key = 'organization.admin'
  );
  IF NOT v_admin AND NOT EXISTS (
    SELECT 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE r.id = v_member.role_id AND r.organization_id = p_org_id AND p.key = 'mercadolibre.manage'
  ) THEN RAISE EXCEPTION 'Sin permiso para registrar devoluciones Meli' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_org_id AND pos_enabled IS DISTINCT FROM false FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Directa no está habilitada para esta organización'; END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_line->'unit_quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_line->'restock') IS DISTINCT FROM 'boolean'
      OR nullif(v_line->>'source_movement_id', '')::uuid IS NULL THEN
      RAISE EXCEPTION 'La línea devuelta requiere salida original, cantidades y condición de reingreso';
    END IF;
    v_quantity := (v_line->>'quantity')::numeric; v_units := (v_line->>'unit_quantity')::numeric;
    IF v_quantity < 0 OR v_quantity <> trunc(v_quantity, 6) OR (v_quantity = 0 AND v_units = 0)
      OR v_quantity > 9007199254 OR v_units < 0 OR v_units <> trunc(v_units)
      OR v_units > 9007199254 THEN RAISE EXCEPTION 'Cantidad devuelta inválida'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'items') e
    GROUP BY (e.value->>'source_movement_id')::uuid HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Una salida original no puede repetirse en la misma devolución';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('source_movement_id', (e.value->>'source_movement_id')::uuid,
    'quantity', (e.value->>'quantity')::numeric, 'unit_quantity', (e.value->>'unit_quantity')::numeric,
    'restock', (e.value->>'restock')::boolean) ORDER BY (e.value->>'source_movement_id')::uuid)
    INTO v_lines FROM jsonb_array_elements(p_payload->'items') e;
  v_reason := btrim(p_payload->>'reason'); v_date := (p_payload->>'return_date')::date;
  v_fallback := (p_payload->>'allow_default_fallback')::boolean;
  IF coalesce(length(v_reason), 0) NOT BETWEEN 5 AND 500 OR v_date IS NULL THEN
    RAISE EXCEPTION 'Indicá fecha y motivo de la devolución física';
  END IF;
  v_normalized := jsonb_build_object('sales_order_id', (p_payload->>'sales_order_id')::uuid,
    'return_date', v_date, 'reason', v_reason, 'allow_default_fallback', v_fallback, 'items', v_lines);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-return:' || p_org_id::text || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO v_sale FROM public.sales_orders WHERE id = (p_payload->>'sales_order_id')::uuid
    AND organization_id = p_org_id AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
      AND user_id = p_actor_id AND warehouse_id = v_sale.warehouse_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El depósito de origen no está asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  SELECT * INTO v_existing FROM public.mercadolibre_returns
    WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM p_actor_id OR v_existing.request_payload IS DISTINCT FROM v_normalized THEN
      RAISE EXCEPTION 'La clave de confirmación ya corresponde a otra devolución';
    END IF;
    IF NOT v_admin THEN
      PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
        AND user_id = p_actor_id AND warehouse_id = v_existing.warehouse_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'El depósito de recepción ya no está asignado al usuario' USING ERRCODE = '42501'; END IF;
    END IF;
    RETURN QUERY SELECT v_existing.id, true; RETURN;
  END IF;
  IF v_sale.status::text <> 'DELIVERED' THEN RAISE EXCEPTION 'Solo se reciben devoluciones de ventas Meli entregadas'; END IF;
  SELECT * INTO STRICT v_source_warehouse FROM public.warehouses
    WHERE id = v_sale.warehouse_id AND organization_id = p_org_id FOR SHARE;
  IF v_source_warehouse.is_active THEN v_destination := v_source_warehouse.id;
  ELSE
    IF NOT v_fallback THEN RAISE EXCEPTION USING MESSAGE = 'El depósito original está inactivo. Indicá el reingreso al depósito principal.', DETAIL = 'WAREHOUSE_FALLBACK_CONFIRMATION_REQUIRED'; END IF;
    SELECT id INTO v_destination FROM public.warehouses
      WHERE organization_id = p_org_id AND is_default AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No hay un depósito principal activo para recibir la devolución'; END IF;
  END IF;
  PERFORM public.assert_stock_reentry_destination(p_org_id, p_actor_id, v_destination);
  -- Same deterministic lot order used by the sale writer before product locks.
  PERFORM l.id FROM public.product_lots l WHERE l.organization_id = p_org_id AND l.id IN (
    SELECT m.lot_id FROM public.stock_movements m
      JOIN public.sales_order_items i ON i.id = m.mercadolibre_sale_item_id AND i.organization_id = m.organization_id
      JOIN jsonb_array_elements(v_lines) e ON (e.value->>'source_movement_id')::uuid = m.id
      WHERE m.organization_id = p_org_id AND i.sales_order_id = v_sale.id AND (e.value->>'restock')::boolean
  ) ORDER BY l.id FOR UPDATE;
  INSERT INTO public.mercadolibre_returns(id, organization_id, sales_order_id, source_warehouse_id,
    warehouse_id, idempotency_key, request_payload, return_date, reason, created_by)
    VALUES(v_id, p_org_id, v_sale.id, v_sale.warehouse_id, v_destination, p_idempotency_key,
      v_normalized, v_date, v_reason, p_actor_id);

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_origin FROM public.stock_movements WHERE id = (v_line->>'source_movement_id')::uuid
      AND organization_id = p_org_id AND type::text = 'OUTBOUND' AND warehouse_id = v_sale.warehouse_id;
    IF NOT FOUND OR v_origin.mercadolibre_sale_item_id IS NULL THEN RAISE EXCEPTION 'Salida Meli original no encontrada'; END IF;
    SELECT * INTO v_item FROM public.sales_order_items WHERE id = v_origin.mercadolibre_sale_item_id
      AND organization_id = p_org_id AND sales_order_id = v_sale.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La salida original no pertenece a esta venta Meli'; END IF;
    v_quantity := (v_line->>'quantity')::numeric; v_units := (v_line->>'unit_quantity')::numeric;
    v_restock := (v_line->>'restock')::boolean;
    IF v_restock THEN
      SELECT * INTO STRICT v_product FROM public.products
        WHERE id = v_item.product_id AND organization_id = p_org_id FOR SHARE;
      v_item_snapshot := v_sale.commercial_snapshot->'meli_items'->(v_item.id::text);
      IF (v_item_snapshot->>'unit_of_measure') IS DISTINCT FROM v_product.unit_of_measure::text
        OR (coalesce(v_product.unit_of_measure::text IN ('KG', 'LT'), false) AND coalesce(v_product.tracks_stock_units, false))
          IS DISTINCT FROM (v_origin.unit_quantity IS NOT NULL) THEN
        RAISE EXCEPTION 'Cambió la unidad o el seguimiento de piezas del producto. Inventario debe revisar el origen antes del reingreso';
      END IF;
    END IF;
    IF (v_origin.unit_quantity IS NULL AND v_units <> 0)
      OR (v_origin.unit_quantity IS NOT NULL AND v_origin.unit_quantity > 0) THEN
      RAISE EXCEPTION 'Las piezas devueltas no coinciden con el seguimiento de la salida original';
    END IF;
    SELECT coalesce(sum(i.quantity), 0), coalesce(sum(i.unit_quantity), 0)
      INTO v_returned, v_returned_units FROM public.mercadolibre_return_items i
      WHERE i.organization_id = p_org_id AND i.source_movement_id = v_origin.id;
    IF v_returned + v_quantity > v_origin.quantity
      OR v_returned_units + v_units > abs(coalesce(v_origin.unit_quantity, 0)) THEN
      RAISE EXCEPTION 'La devolución supera la mercadería pendiente de recibir de esa salida';
    END IF;
    INSERT INTO public.mercadolibre_return_items(organization_id, return_id, sales_order_item_id,
      source_movement_id, source_lot_id, product_id, product_variant_id, quantity, unit_quantity, restock)
      VALUES(p_org_id, v_id, v_item.id, v_origin.id, v_origin.lot_id, v_item.product_id,
        v_item.product_variant_id, v_quantity, v_units, v_restock);
    IF v_restock THEN
      v_entries := v_entries || jsonb_build_array(jsonb_build_object('source_lot_id', v_origin.lot_id,
        'quantity', v_quantity, 'unit_quantity', CASE WHEN v_origin.unit_quantity IS NULL THEN NULL ELSE v_units END,
        'reason', 'Devolución Mercado Libre ' || v_id::text || ' - ' || v_reason,
        'operation_key', 'meli-return:' || v_id::text || ':' || v_origin.id::text));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_entries) > 0 THEN
    v_movements := public.apply_stock_reentries(p_org_id, p_actor_id, v_entries, v_fallback);
    UPDATE public.stock_movements m SET mercadolibre_return_item_id = i.id
      FROM public.mercadolibre_return_items i WHERE i.return_id = v_id AND i.organization_id = p_org_id
        AND i.restock AND m.organization_id = p_org_id AND m.id = ANY(v_movements)
        AND m.reentry_key = 'meli-return:' || v_id::text || ':' || i.source_movement_id::text;
  END IF;
  RETURN QUERY SELECT v_id, false;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_mercadolibre_return(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mercadolibre_return(uuid, uuid, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.guard_meli_return_document() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_return_movement() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_meli_return_complete() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
