-- Phase 1: commercial schema only. No sale, payment, receivable or stock
-- movement is created/backfilled. Authenticated Meli access remains closed
-- until the transactional writer and channel-scoped readers are installed.
BEGIN;

-- These parent tables must already enforce their normal tenant policies.
-- Extras are handled explicitly below: the target database has no extras
-- policies and RLS disabled, unlike sales_order_items.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'sales_orders', 'sales_order_items', 'sales_order_taxes',
    'sales_order_item_taxes'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Se requiere revisar el RLS existente de public.% antes de aplicar Meli', v_table;
    END IF;
  END LOOP;
END;
$$;

INSERT INTO public.permissions (key, description) VALUES
  ('mercadolibre.manage', 'Registrar ventas del canal Mercado Libre'),
  ('mercadolibre.invoice', 'Emitir y reintentar facturas de ventas Mercado Libre')
ON CONFLICT (key) DO NOTHING;

-- Where WhatsApp is installed, source remains MANUAL/WHATSAPP: entry
-- mechanism and commercial channel are independent. Meli does not depend on
-- that optional module. Existing sales_orders records belong to wholesale.
ALTER TABLE public.sales_orders
  ADD COLUMN sales_channel text NOT NULL DEFAULT 'WHOLESALE',
  ADD COLUMN marketplace_order_number text,
  ADD COLUMN marketplace_idempotency_key uuid,
  ADD COLUMN fiscal_receiver_snapshot jsonb;

-- JSON v1 is an explicit receiver, not a fake customers row. Document numbers
-- are strings so identification does not depend on integer coercion.
CREATE FUNCTION public.is_valid_meli_fiscal_receiver(p_receiver jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(
    jsonb_typeof(p_receiver) = 'object'
    AND p_receiver->'version' = '1'::jsonb
    AND jsonb_typeof(p_receiver->'document_number') = 'string'
    AND jsonb_typeof(p_receiver->'address') = 'string'
    AND length(btrim(p_receiver->>'address')) > 0
    AND CASE p_receiver->>'tax_condition'
      WHEN 'CONSUMIDOR_FINAL' THEN
        p_receiver->>'document_type' = 'DNI'
        AND p_receiver->>'document_number' ~ '^[0-9]{7,8}$'
        AND jsonb_typeof(p_receiver->'first_name') = 'string'
        AND length(btrim(p_receiver->>'first_name')) > 0
        AND jsonb_typeof(p_receiver->'last_name') = 'string'
        AND length(btrim(p_receiver->>'last_name')) > 0
      WHEN 'RESPONSABLE_INSCRIPTO' THEN
        p_receiver->>'document_type' = 'CUIT'
        AND p_receiver->>'document_number' ~ '^[0-9]{11}$'
        AND jsonb_typeof(p_receiver->'business_name') = 'string'
        AND length(btrim(p_receiver->>'business_name')) > 0
      ELSE false
    END,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_valid_meli_fiscal_receiver(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_meli_fiscal_receiver(jsonb)
  TO authenticated, service_role;

ALTER TABLE public.sales_orders
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD CONSTRAINT sales_orders_sales_channel_check
    CHECK (sales_channel IN ('WHOLESALE', 'MERCADO_LIBRE')),
  ADD CONSTRAINT sales_orders_channel_buyer_check CHECK (
    CASE WHEN sales_channel = 'MERCADO_LIBRE' THEN
      public.is_valid_meli_fiscal_receiver(fiscal_receiver_snapshot)
    ELSE customer_id IS NOT NULL END
  ),
  ADD CONSTRAINT sales_orders_marketplace_fields_check CHECK (
    CASE WHEN sales_channel = 'MERCADO_LIBRE' THEN
      marketplace_order_number IS NOT NULL
      AND marketplace_order_number = btrim(marketplace_order_number)
      AND length(marketplace_order_number) BETWEEN 1 AND 120
      AND marketplace_idempotency_key IS NOT NULL
      AND document_type = 'STANDARD'
      AND invoice_type::text IN ('FACTURA_A', 'FACTURA_B', 'FACTURA_C')
      AND parent_sales_order_id IS NULL
      AND is_historical = false
    ELSE marketplace_order_number IS NULL
      AND marketplace_idempotency_key IS NULL
      AND fiscal_receiver_snapshot IS NULL END
  );

CREATE UNIQUE INDEX sales_orders_meli_order_unique
  ON public.sales_orders (organization_id, sales_channel, marketplace_order_number)
  WHERE sales_channel = 'MERCADO_LIBRE';
CREATE UNIQUE INDEX sales_orders_meli_idempotency_unique
  ON public.sales_orders (organization_id, marketplace_idempotency_key)
  WHERE sales_channel = 'MERCADO_LIBRE';
CREATE INDEX sales_orders_meli_date_idx
  ON public.sales_orders (organization_id, sale_date DESC, id)
  WHERE sales_channel = 'MERCADO_LIBRE';

-- A missing row means Meli is not configured. Never fall back to the principal
-- warehouse. The actual stock writer must also validate the actor's assignment.
CREATE TABLE public.mercadolibre_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  warehouse_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (warehouse_id, organization_id)
    REFERENCES public.warehouses(id, organization_id) ON DELETE RESTRICT
);
ALTER TABLE public.mercadolibre_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mercadolibre_settings TO authenticated;
GRANT ALL ON public.mercadolibre_settings TO service_role;

CREATE POLICY mercadolibre_settings_admin_read
  ON public.mercadolibre_settings FOR SELECT TO authenticated
  USING (public.has_warehouse_admin_access(organization_id));

CREATE FUNCTION public.save_mercadolibre_settings(p_org_id uuid, p_warehouse_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_warehouse_admin(p_org_id);
  PERFORM 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = p_org_id
      AND is_active AND direct_sale_enabled
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seleccioná un depósito activo habilitado para venta directa de esta organización';
  END IF;
  INSERT INTO public.mercadolibre_settings (organization_id, warehouse_id)
    VALUES (p_org_id, p_warehouse_id)
    ON CONFLICT (organization_id) DO UPDATE
      SET warehouse_id = excluded.warehouse_id, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_mercadolibre_settings(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_mercadolibre_settings(uuid, uuid)
  TO authenticated;

-- Keep the channel fixed: a wholesale edit must never convert an existing sale
-- into Meli (or bypass its financial policy by converting it back).
CREATE FUNCTION public.enforce_meli_sale_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale_json jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.sales_channel IS DISTINCT FROM OLD.sales_channel THEN
      RAISE EXCEPTION 'No se puede cambiar el canal de una venta existente';
    END IF;
    IF OLD.sales_channel = 'MERCADO_LIBRE' AND (
      NEW.marketplace_order_number IS DISTINCT FROM OLD.marketplace_order_number
      OR NEW.marketplace_idempotency_key IS DISTINCT FROM OLD.marketplace_idempotency_key
    ) THEN
      RAISE EXCEPTION 'La orden externa y la identidad de confirmación no se pueden cambiar';
    END IF;
  END IF;
  IF NEW.sales_channel = 'MERCADO_LIBRE' THEN
    -- These fields belong to the optional WhatsApp module and may not exist
    -- in the target schema. Inspect the row as JSON instead of introducing a
    -- dependency on WhatsApp migrations or adding its columns from Meli.
    v_sale_json := to_jsonb(NEW);
    IF (v_sale_json->>'source' IS NOT NULL
        AND v_sale_json->>'source' <> 'MANUAL')
      OR v_sale_json->>'conversation_id' IS NOT NULL
      OR v_sale_json->>'whatsapp_cart_id' IS NOT NULL THEN
      RAISE EXCEPTION 'Una venta Mercado Libre no puede vincularse a un flujo WhatsApp';
    END IF;
  END IF;
  IF NEW.sales_channel = 'MERCADO_LIBRE' AND NEW.customer_id IS NOT NULL THEN
    PERFORM 1 FROM public.customers
      WHERE id = NEW.customer_id AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cliente no pertenece a la organización de la venta';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.sales_channel = 'MERCADO_LIBRE' THEN
    PERFORM 1 FROM public.mercadolibre_settings s
      JOIN public.warehouses w
        ON w.id = s.warehouse_id AND w.organization_id = s.organization_id
      WHERE s.organization_id = NEW.organization_id
        AND s.warehouse_id = NEW.warehouse_id
        AND w.is_active AND w.direct_sale_enabled;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La venta debe usar el depósito activo configurado para Mercado Libre';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_orders_meli_identity_guard
  BEFORE INSERT OR UPDATE ON public.sales_orders FOR EACH ROW
  EXECUTE FUNCTION public.enforce_meli_sale_identity();
REVOKE ALL ON FUNCTION public.enforce_meli_sale_identity()
  FROM PUBLIC, anon, authenticated;

-- Independently of the organization's fiscal-debt setting, Meli must never
-- create an accounts_receivable, including the INSERT from ARCA's trigger.
-- Existing accounts and their payments are not changed by this migration.
CREATE FUNCTION public.prevent_meli_receivable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale_org uuid;
BEGIN
  SELECT organization_id INTO v_sale_org FROM public.sales_orders
    WHERE id = NEW.sales_order_id AND sales_channel = 'MERCADO_LIBRE';
  IF FOUND THEN
    IF v_sale_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'La venta no pertenece a la organización de la cuenta';
    END IF;
    IF TG_OP = 'INSERT' THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'Las ventas Mercado Libre no generan cuentas por cobrar';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_receivable_meli_guard
  BEFORE INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW
  EXECUTE FUNCTION public.prevent_meli_receivable();
REVOKE ALL ON FUNCTION public.prevent_meli_receivable()
  FROM PUBLIC, anon, authenticated;

-- Existing permissive policies are environment-specific. Add a restrictive
-- staging gate rather than replacing or broadening those legacy policies.
-- Phase 2 must replace this gate when channel-scoped access/RPCs are ready.

-- The target database grants extras DML to anon/authenticated without RLS.
-- Mirror the verified sales_order_items permissions through the parent item,
-- since extras have no organization_id. The parent SELECT still applies its
-- own RLS; no parent policy reads extras, so this dependency cannot recurse.
ALTER TABLE public.sales_order_item_extras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_item_extras FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_item_extras
  TO authenticated, service_role;

CREATE POLICY sales_order_item_extras_parent_read
  ON public.sales_order_item_extras FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_order_items i
    WHERE i.id = sales_order_item_extras.sales_order_item_id
      AND auth.uid() IS NOT NULL
      AND (
        public.user_has_org_permission(i.organization_id, 'sales.read')
        OR public.user_has_org_permission(i.organization_id, 'sales.manage')
      )
  ));

CREATE POLICY sales_order_item_extras_parent_insert
  ON public.sales_order_item_extras FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_order_items i
    WHERE i.id = sales_order_item_extras.sales_order_item_id
      AND auth.uid() IS NOT NULL
      AND public.user_has_org_permission(i.organization_id, 'sales.manage')
  ));

CREATE POLICY sales_order_item_extras_parent_update
  ON public.sales_order_item_extras FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_order_items i
    WHERE i.id = sales_order_item_extras.sales_order_item_id
      AND auth.uid() IS NOT NULL
      AND public.user_has_org_permission(i.organization_id, 'sales.manage')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sales_order_items i
    WHERE i.id = sales_order_item_extras.sales_order_item_id
      AND auth.uid() IS NOT NULL
      AND public.user_has_org_permission(i.organization_id, 'sales.manage')
  ));

CREATE POLICY sales_order_item_extras_parent_delete
  ON public.sales_order_item_extras FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_order_items i
    WHERE i.id = sales_order_item_extras.sales_order_item_id
      AND auth.uid() IS NOT NULL
      AND public.user_has_org_permission(i.organization_id, 'sales.manage')
  ));

CREATE POLICY sales_orders_meli_staging_gate
  ON public.sales_orders AS RESTRICTIVE FOR ALL TO authenticated
  USING (sales_channel <> 'MERCADO_LIBRE')
  WITH CHECK (sales_channel <> 'MERCADO_LIBRE');

-- Definer metadata-only lookup: child policies cannot use an invoker parent
-- SELECT here, because a hidden parent would otherwise look nonexistent.
CREATE FUNCTION public.is_mercadolibre_sale(p_sale_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE id = p_sale_id AND sales_channel = 'MERCADO_LIBRE'
  );
$$;
REVOKE ALL ON FUNCTION public.is_mercadolibre_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mercadolibre_sale(uuid)
  TO authenticated, service_role;

CREATE POLICY sales_order_items_meli_staging_gate
  ON public.sales_order_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_mercadolibre_sale(sales_order_id))
  WITH CHECK (NOT public.is_mercadolibre_sale(sales_order_id));
CREATE POLICY sales_order_taxes_meli_staging_gate
  ON public.sales_order_taxes AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_mercadolibre_sale(sales_order_id))
  WITH CHECK (NOT public.is_mercadolibre_sale(sales_order_id));
CREATE POLICY sales_order_item_taxes_meli_staging_gate
  ON public.sales_order_item_taxes AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_mercadolibre_sale(sales_order_id))
  WITH CHECK (NOT public.is_mercadolibre_sale(sales_order_id));

CREATE FUNCTION public.is_mercadolibre_sale_item(p_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales_order_items i
    JOIN public.sales_orders s ON s.id = i.sales_order_id
      AND s.organization_id = i.organization_id
    WHERE i.id = p_item_id AND s.sales_channel = 'MERCADO_LIBRE'
  );
$$;
REVOKE ALL ON FUNCTION public.is_mercadolibre_sale_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mercadolibre_sale_item(uuid)
  TO authenticated, service_role;
CREATE POLICY sales_order_item_extras_meli_staging_gate
  ON public.sales_order_item_extras AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_mercadolibre_sale_item(sales_order_item_id))
  WITH CHECK (NOT public.is_mercadolibre_sale_item(sales_order_item_id));

COMMIT;
