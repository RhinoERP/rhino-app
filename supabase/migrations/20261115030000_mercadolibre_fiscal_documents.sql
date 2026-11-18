-- The operator selects A/B/C. ARCA may authorize A with withholding legend
-- (voucher 51) according to the issuer's existing configuration. Persist that
-- actual invoice type without changing the POS selector or other channels.
BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN marketplace_items_snapshot_version smallint NOT NULL DEFAULT 0
    CHECK (marketplace_items_snapshot_version IN (0, 1));

ALTER TABLE public.sales_orders
  DROP CONSTRAINT sales_orders_marketplace_fields_check,
  ADD CONSTRAINT sales_orders_marketplace_fields_check CHECK (
    CASE WHEN sales_channel = 'MERCADO_LIBRE' THEN
      marketplace_order_number IS NOT NULL
      AND marketplace_order_number = btrim(marketplace_order_number)
      AND length(marketplace_order_number) BETWEEN 1 AND 120
      AND marketplace_idempotency_key IS NOT NULL
      AND document_type = 'STANDARD'
      AND invoice_type::text IN ('FACTURA_A', 'FACTURA_A_RETENCION', 'FACTURA_B', 'FACTURA_C')
      AND parent_sales_order_id IS NULL
      AND is_historical = false
    ELSE marketplace_order_number IS NULL
      AND marketplace_idempotency_key IS NULL
      AND fiscal_receiver_snapshot IS NULL END
  );

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_meli_final_status_check
  CHECK (sales_channel <> 'MERCADO_LIBRE' OR status::text IN ('DELIVERED', 'CANCELLED'));

-- sales_orders.sub_total is net of line discounts, before the global discount,
-- as in the existing sales service. Keep the already-applied atomic writer and
-- replay implementation private; normalize this derived header in the same tx.
ALTER FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb)
  RENAME TO commit_mercadolibre_sale_with_input_replay;
REVOKE ALL ON FUNCTION public.commit_mercadolibre_sale_with_input_replay(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.commit_mercadolibre_sale(
  p_org_id uuid, p_actor_id uuid, p_idempotency_key uuid, p_payload jsonb
) RETURNS TABLE (sale_id uuid, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result record;
BEGIN
  SELECT * INTO STRICT v_result FROM public.commit_mercadolibre_sale_with_input_replay(
    p_org_id, p_actor_id, p_idempotency_key, p_payload
  );
  WITH line_totals AS (
    SELECT sum(i.subtotal) AS net FROM public.sales_order_items i
    WHERE i.sales_order_id = v_result.sale_id AND i.organization_id = p_org_id
  ) UPDATE public.sales_orders s SET sub_total = t.net
    FROM line_totals t WHERE s.id = v_result.sale_id AND s.organization_id = p_org_id
      AND s.sales_channel = 'MERCADO_LIBRE' AND s.arca_status IN ('not_requested', 'error')
      AND t.net IS NOT NULL AND s.sub_total IS DISTINCT FROM t.net;
  RETURN QUERY SELECT v_result.sale_id::uuid, v_result.idempotent::boolean;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mercadolibre_sale(uuid, uuid, uuid, jsonb) TO service_role;

-- Legacy SECURITY DEFINER editors bypass RLS. They must not become an
-- alternative Meli writer just because their caller can manage wholesale.
CREATE FUNCTION public.guard_meli_private_fiscal_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sales_channel = 'MERCADO_LIBRE'
      AND coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Las ventas Meli se registran exclusivamente por su servicio';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.sales_channel = 'MERCADO_LIBRE' THEN
    IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Esta operación requiere el servicio del canal Mercado Libre';
    END IF;
    IF OLD.arca_status IN ('pending', 'authorized') THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'No se puede eliminar una venta Meli con emisión fiscal pendiente o autorizada';
      END IF;
      IF ROW(NEW.customer_id, NEW.fiscal_receiver_snapshot, NEW.commercial_snapshot,
          NEW.marketplace_items_snapshot_version, NEW.currency,
          NEW.commercial_exchange_rate, NEW.total_amount, NEW.sub_total,
          NEW.total_tax_amount, NEW.global_discount_amount,
          NEW.global_discount_percentage, NEW.sale_date, NEW.warehouse_id)
        IS DISTINCT FROM
        ROW(OLD.customer_id, OLD.fiscal_receiver_snapshot, OLD.commercial_snapshot,
          OLD.marketplace_items_snapshot_version, OLD.currency,
          OLD.commercial_exchange_rate, OLD.total_amount, OLD.sub_total,
          OLD.total_tax_amount, OLD.global_discount_amount,
          OLD.global_discount_percentage, OLD.sale_date, OLD.warehouse_id) THEN
        RAISE EXCEPTION 'Los datos comerciales y fiscales de Meli quedan fijos al iniciar la emisión';
      END IF;
      IF NEW.invoice_type IS DISTINCT FROM OLD.invoice_type AND NOT (
        OLD.arca_status = 'pending' AND NEW.arca_status = 'authorized'
        AND OLD.invoice_type::text = 'FACTURA_A'
        AND NEW.invoice_type::text = 'FACTURA_A_RETENCION'
      ) THEN RAISE EXCEPTION 'No se puede cambiar el comprobante de una emisión Meli iniciada'; END IF;
      IF OLD.arca_status = 'authorized' AND (
        NEW.arca_status IS DISTINCT FROM OLD.arca_status
        OR ROW(NEW.arca_cae, NEW.arca_cae_expires_at, NEW.arca_authorized_at,
          NEW.arca_point_of_sale, NEW.arca_voucher_number, NEW.arca_voucher_type_code,
          NEW.invoice_number, NEW.exchange_rate, NEW.arca_request_json)
          IS DISTINCT FROM ROW(OLD.arca_cae, OLD.arca_cae_expires_at, OLD.arca_authorized_at,
          OLD.arca_point_of_sale, OLD.arca_voucher_number, OLD.arca_voucher_type_code,
          OLD.invoice_number, OLD.exchange_rate, OLD.arca_request_json)
      ) THEN RAISE EXCEPTION 'La autorización fiscal Meli no se puede reiniciar ni reemplazar'; END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_orders_meli_private_fiscal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_orders FOR EACH ROW
  EXECUTE FUNCTION public.guard_meli_private_fiscal_sale();

CREATE FUNCTION public.assert_meli_commercial_write(p_sale_id uuid, p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_channel text; v_status text; v_org uuid;
BEGIN
  SELECT sales_channel, arca_status, organization_id INTO v_channel, v_status, v_org
    FROM public.sales_orders WHERE id = p_sale_id FOR UPDATE;
  IF FOUND AND v_channel = 'MERCADO_LIBRE' AND v_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'La línea Meli no pertenece a la organización de su venta';
  END IF;
  IF FOUND AND v_channel = 'MERCADO_LIBRE' AND (
    coalesce(auth.role(), '') IN ('anon', 'authenticated')
    OR v_status IN ('pending', 'authorized')
  ) THEN RAISE EXCEPTION 'No se puede modificar el detalle comercial de esta venta Meli'; END IF;
END;
$$;

CREATE FUNCTION public.guard_meli_commercial_detail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old_sale uuid; v_new_sale uuid; v_old_org uuid; v_new_org uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF TG_TABLE_NAME = 'sales_order_item_extras' THEN
      SELECT sales_order_id, organization_id INTO v_old_sale, v_old_org FROM public.sales_order_items WHERE id = OLD.sales_order_item_id;
    ELSE v_old_sale := OLD.sales_order_id; v_old_org := OLD.organization_id; END IF;
    PERFORM public.assert_meli_commercial_write(v_old_sale, v_old_org);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'sales_order_item_extras' THEN
      SELECT sales_order_id, organization_id INTO v_new_sale, v_new_org FROM public.sales_order_items WHERE id = NEW.sales_order_item_id;
    ELSE v_new_sale := NEW.sales_order_id; v_new_org := NEW.organization_id; END IF;
    IF TG_OP = 'INSERT' OR v_new_sale IS DISTINCT FROM v_old_sale OR v_new_org IS DISTINCT FROM v_old_org THEN
      PERFORM public.assert_meli_commercial_write(v_new_sale, v_new_org);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_items_meli_fiscal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_items FOR EACH ROW
  EXECUTE FUNCTION public.guard_meli_commercial_detail();
CREATE TRIGGER sales_order_taxes_meli_fiscal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_taxes FOR EACH ROW
  EXECUTE FUNCTION public.guard_meli_commercial_detail();
CREATE TRIGGER sales_order_item_taxes_meli_fiscal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_item_taxes FOR EACH ROW
  EXECUTE FUNCTION public.guard_meli_commercial_detail();
CREATE TRIGGER sales_order_item_extras_meli_fiscal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_item_extras FOR EACH ROW
  EXECUTE FUNCTION public.guard_meli_commercial_detail();

-- Deferred until the end of the original transaction, while its product/variant
-- locks are still held. The first event captures all lines in one aggregate;
-- later events only read a small version marker. Avoid both rewriting and
-- detoasting a growing JSON per line.
CREATE FUNCTION public.snapshot_meli_sale_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_channel text; v_version smallint; v_snapshots jsonb; v_count integer;
BEGIN
  SELECT sales_channel, marketplace_items_snapshot_version INTO v_channel, v_version
    FROM public.sales_orders
    WHERE id = NEW.sales_order_id AND organization_id = NEW.organization_id;
  IF v_channel IS DISTINCT FROM 'MERCADO_LIBRE' THEN RETURN NEW; END IF;
  IF v_version = 1 THEN RETURN NEW; END IF;
  SELECT jsonb_object_agg(i.id::text, jsonb_build_object(
      'name', concat_ws(' - ', p.name,
        nullif(concat_ws(' / ', nullif(v.talle, ''), nullif(v.color, '')), '')),
      'sku', coalesce(p.sku, ''), 'brand', p.brand,
      'variant_name', nullif(concat_ws(' / ', nullif(v.talle, ''), nullif(v.color, '')), ''),
      'unit_of_measure', coalesce(p.unit_of_measure::text, 'UN'),
      'tracks_stock_units', coalesce(p.tracks_stock_units, false)
    )) INTO v_snapshots
    FROM public.sales_order_items i
    JOIN public.products p ON p.id = i.product_id AND p.organization_id = i.organization_id
    LEFT JOIN public.product_variants v ON v.id = i.product_variant_id
      AND v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE i.sales_order_id = NEW.sales_order_id AND i.organization_id = NEW.organization_id
      AND nullif(btrim(p.name), '') IS NOT NULL;
  SELECT count(*) INTO v_count FROM public.sales_order_items
    WHERE sales_order_id = NEW.sales_order_id AND organization_id = NEW.organization_id;
  IF v_snapshots IS NULL OR v_count <> (SELECT count(*) FROM jsonb_object_keys(v_snapshots)) THEN
    RAISE EXCEPTION 'No se pudieron capturar los productos de todas las líneas Meli';
  END IF;
  UPDATE public.sales_order_items i
    SET description = (v_snapshots->(i.id::text))->>'name'
    WHERE i.sales_order_id = NEW.sales_order_id AND i.organization_id = NEW.organization_id;
  UPDATE public.sales_orders SET marketplace_items_snapshot_version = 1,
    commercial_snapshot = jsonb_set(
      coalesce(commercial_snapshot, '{}'::jsonb), '{meli_items}', v_snapshots, true
    ) WHERE id = NEW.sales_order_id AND organization_id = NEW.organization_id;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER sales_order_items_meli_line_snapshot
  AFTER INSERT ON public.sales_order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_meli_sale_item();

ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_meli_outbound_check
  CHECK (mercadolibre_sale_item_id IS NULL OR type::text = 'OUTBOUND');
CREATE FUNCTION public.guard_meli_sale_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.mercadolibre_sale_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'La salida de stock Meli es un evento histórico; las correcciones requieren un nuevo movimiento';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.mercadolibre_sale_item_id IS NOT NULL
      AND coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'La salida de stock Meli requiere el servicio del canal';
    END IF;
    IF NEW.mercadolibre_sale_item_id IS NOT NULL THEN
      PERFORM 1 FROM public.sales_order_items i
        JOIN public.sales_orders s ON s.id = i.sales_order_id AND s.organization_id = i.organization_id
        JOIN public.product_lots l ON l.id = NEW.lot_id
          AND l.organization_id = s.organization_id AND l.warehouse_id = s.warehouse_id
          AND l.product_id = i.product_id
          AND l.product_variant_id IS NOT DISTINCT FROM i.product_variant_id
        WHERE i.id = NEW.mercadolibre_sale_item_id AND s.sales_channel = 'MERCADO_LIBRE'
          AND s.organization_id = NEW.organization_id AND s.warehouse_id = NEW.warehouse_id
          AND s.arca_status = 'not_requested';
      IF NOT FOUND THEN RAISE EXCEPTION 'La salida Meli no coincide con la venta, producto y depósito de origen'; END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movements_meli_history_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_movements FOR EACH ROW
  EXECUTE FUNCTION public.guard_meli_sale_movement();

REVOKE ALL ON FUNCTION public.guard_meli_private_fiscal_sale() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_meli_commercial_write(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_commercial_detail() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_sale_movement() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.snapshot_meli_sale_item() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
