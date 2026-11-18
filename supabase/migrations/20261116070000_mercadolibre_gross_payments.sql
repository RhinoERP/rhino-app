-- Operational gross collections. No receivables, customer credit, treasury or
-- accounting side effects. Approval/issuance of an invoice never creates a payment.
BEGIN;

INSERT INTO public.permissions(key, description) VALUES
  ('mercadolibre.payments.read', 'Consultar ventas y cobros brutos Mercado Libre en los depósitos asignados'),
  ('mercadolibre.payments.manage', 'Registrar y anular registros de cobros brutos Mercado Libre en los depósitos asignados')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE public.mercadolibre_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  fiscal_receiver_snapshot jsonb NOT NULL CHECK (public.is_valid_meli_fiscal_receiver(fiscal_receiver_snapshot)),
  amount numeric NOT NULL CHECK (amount > 0 AND amount = trunc(amount, 2)
    AND amount <= 90071992547409.91 AND amount::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
  destination text NOT NULL DEFAULT 'MERCADO_PAGO' CHECK (destination = 'MERCADO_PAGO'),
  payment_date date NOT NULL,
  reference_number text NOT NULL CHECK (reference_number = btrim(reference_number) AND length(reference_number) BETWEEN 1 AND 120),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  status text NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'VOIDED')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid REFERENCES auth.users(id),
  voided_at timestamptz,
  void_reason text,
  UNIQUE (organization_id, idempotency_key),
  CHECK (CASE WHEN status = 'RECORDED' THEN
    voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL
    ELSE voided_by IS NOT NULL AND voided_at IS NOT NULL
      AND void_reason IS NOT NULL AND length(btrim(void_reason)) BETWEEN 5 AND 500 END)
);
CREATE INDEX mercadolibre_payments_sale ON public.mercadolibre_payments(organization_id, sales_order_id, status, payment_date, id);
CREATE UNIQUE INDEX mercadolibre_payments_active_reference
  ON public.mercadolibre_payments(organization_id, sales_order_id, lower(reference_number)) WHERE status = 'RECORDED';
ALTER TABLE public.mercadolibre_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadolibre_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mercadolibre_payments TO service_role;

-- Returns whether the actor is an administrator; other actors remain warehouse-scoped.
CREATE FUNCTION public.assert_meli_payment_access(p_org_id uuid, p_actor_id uuid, p_write boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean; v_read boolean; v_manage boolean;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_write IS NULL THEN
    RAISE EXCEPTION 'Organización o responsable de cobro inválido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(m.is_owner, false) OR coalesce(bool_or(p.key = 'organization.admin'), false),
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN ('organization.admin', 'mercadolibre.payments.read', 'mercadolibre.payments.manage')), false),
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN ('organization.admin', 'mercadolibre.payments.manage')), false)
    INTO v_admin, v_read, v_manage
    FROM public.organization_members m
    LEFT JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active
    GROUP BY m.is_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario fuera de la organización' USING ERRCODE = '42501'; END IF;
  IF NOT v_read OR (p_write AND NOT v_manage) THEN
    RAISE EXCEPTION 'Sin permiso para gestionar estos cobros Mercado Libre' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_org_id AND is_active AND pos_enabled IS DISTINCT FROM false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Directa no está habilitada para esta organización' USING ERRCODE = '42501'; END IF;
  RETURN v_admin;
END;
$$;

CREATE FUNCTION public.guard_mercadolibre_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale public.sales_orders%ROWTYPE; v_admin boolean; v_collected numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Los registros de cobro Meli se anulan conservando su historial'; END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Los cobros Meli requieren el servicio autorizado' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.organization_id, NEW.sales_order_id, NEW.warehouse_id, NEW.idempotency_key,
      NEW.request_payload, NEW.fiscal_receiver_snapshot, NEW.amount, NEW.currency, NEW.destination,
      NEW.payment_date, NEW.reference_number, NEW.notes, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.sales_order_id, OLD.warehouse_id, OLD.idempotency_key,
      OLD.request_payload, OLD.fiscal_receiver_snapshot, OLD.amount, OLD.currency, OLD.destination,
      OLD.payment_date, OLD.reference_number, OLD.notes, OLD.created_by, OLD.created_at)
      OR OLD.status <> 'RECORDED' OR NEW.status <> 'VOIDED' THEN
      RAISE EXCEPTION 'El contenido del cobro registrado es inmutable; anulá la carga para corregirla';
    END IF;
    v_admin := public.assert_meli_payment_access(NEW.organization_id, NEW.voided_by, true);
    NEW.void_reason := btrim(NEW.void_reason);
    IF coalesce(length(NEW.void_reason), 0) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Indicá el motivo de anulación de la carga'; END IF;
    NEW.voided_at := now();
  ELSE
    v_admin := public.assert_meli_payment_access(NEW.organization_id, NEW.created_by, true);
    IF NEW.status <> 'RECORDED' THEN RAISE EXCEPTION 'Un cobro nuevo debe registrarse como vigente'; END IF;
    NEW.created_at := now();
  END IF;
  SELECT * INTO v_sale FROM public.sales_orders WHERE id = NEW.sales_order_id
    AND organization_id = NEW.organization_id AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND OR NEW.warehouse_id IS DISTINCT FROM v_sale.warehouse_id OR NEW.currency IS DISTINCT FROM v_sale.currency::text THEN
    RAISE EXCEPTION 'El cobro no coincide con la organización, depósito o moneda de la venta Meli';
  END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = NEW.organization_id
      AND user_id = CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by ELSE NEW.voided_by END
      AND warehouse_id = v_sale.warehouse_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El depósito de la venta no está asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_sale.status::text <> 'DELIVERED' THEN RAISE EXCEPTION 'Solo se registran cobros nuevos para ventas Meli entregadas y no canceladas'; END IF;
    IF NEW.fiscal_receiver_snapshot IS DISTINCT FROM v_sale.fiscal_receiver_snapshot THEN
      RAISE EXCEPTION 'El comprador del cobro debe capturarse desde la venta Meli';
    END IF;
    NEW.request_payload := jsonb_build_object('sales_order_id', NEW.sales_order_id,
      'amount', NEW.amount, 'currency', NEW.currency, 'payment_date', NEW.payment_date,
      'reference_number', NEW.reference_number, 'notes', NEW.notes);
    SELECT coalesce(sum(amount), 0) INTO v_collected FROM public.mercadolibre_payments
      WHERE organization_id = NEW.organization_id AND sales_order_id = NEW.sales_order_id
        AND status = 'RECORDED' AND id IS DISTINCT FROM NEW.id;
    IF NEW.amount IS NULL OR NEW.amount <= 0 OR v_collected + NEW.amount > v_sale.total_amount THEN
      RAISE EXCEPTION 'El importe supera el saldo sin cobro registrado de la venta Meli';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mercadolibre_payments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.mercadolibre_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_mercadolibre_payment();

CREATE FUNCTION public.commit_mercadolibre_payment(p_org_id uuid, p_actor_id uuid, p_idempotency_key uuid, p_payload jsonb)
RETURNS TABLE (payment_id uuid, idempotent boolean, payment_status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean; v_sale public.sales_orders%ROWTYPE; v_existing public.mercadolibre_payments%ROWTYPE;
  v_amount numeric; v_currency text; v_date date; v_reference text; v_notes text; v_payload jsonb; v_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'El cobro Meli requiere el servicio autorizado' USING ERRCODE = '42501'; END IF;
  v_admin := public.assert_meli_payment_access(p_org_id, p_actor_id, true);
  IF p_idempotency_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Solicitud de cobro Meli inválida'; END IF;
  v_amount := (p_payload->>'amount')::numeric; v_currency := p_payload->>'currency';
  v_date := (p_payload->>'payment_date')::date; v_reference := btrim(p_payload->>'reference_number');
  v_notes := coalesce(btrim(p_payload->>'notes'), '');
  IF v_amount <= 0 OR v_amount <> trunc(v_amount, 2) OR v_amount > 90071992547409.91
    OR v_currency IS NULL OR v_currency NOT IN ('ARS', 'USD') OR v_date IS NULL
    OR coalesce(length(v_reference), 0) NOT BETWEEN 1 AND 120 OR length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'Indicá importe bruto, moneda, fecha e ID de operación Mercado Pago válidos';
  END IF;
  v_payload := jsonb_build_object('sales_order_id', (p_payload->>'sales_order_id')::uuid,
    'amount', v_amount, 'currency', v_currency, 'payment_date', v_date, 'reference_number', v_reference, 'notes', v_notes);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meli-payment:' || p_org_id::text || ':' || p_idempotency_key::text, 0));
  SELECT * INTO v_sale FROM public.sales_orders WHERE id = (p_payload->>'sales_order_id')::uuid
    AND organization_id = p_org_id AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
      AND user_id = p_actor_id AND warehouse_id = v_sale.warehouse_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El depósito de la venta no está asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  SELECT * INTO v_existing FROM public.mercadolibre_payments
    WHERE organization_id = p_org_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM p_actor_id OR v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'La clave de confirmación ya corresponde a otro cobro';
    END IF;
    RETURN QUERY SELECT v_existing.id, true, v_existing.status; RETURN;
  END IF;
  INSERT INTO public.mercadolibre_payments(organization_id, sales_order_id, warehouse_id, idempotency_key,
    request_payload, fiscal_receiver_snapshot, amount, currency, payment_date, reference_number, notes, created_by)
    VALUES(p_org_id, v_sale.id, v_sale.warehouse_id, p_idempotency_key, v_payload,
      v_sale.fiscal_receiver_snapshot, v_amount, v_currency, v_date, v_reference, v_notes, p_actor_id)
    RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, false, 'RECORDED'::text;
END;
$$;

CREATE FUNCTION public.void_mercadolibre_payment(p_org_id uuid, p_actor_id uuid, p_payment_id uuid, p_reason text)
RETURNS TABLE (payment_id uuid, idempotent boolean, payment_status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean; v_sale_id uuid; v_sale public.sales_orders%ROWTYPE; v_payment public.mercadolibre_payments%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'La anulación requiere el servicio autorizado' USING ERRCODE = '42501'; END IF;
  v_admin := public.assert_meli_payment_access(p_org_id, p_actor_id, true);
  IF coalesce(length(btrim(p_reason)), 0) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Indicá el motivo de anulación de la carga'; END IF;
  SELECT sales_order_id INTO v_sale_id FROM public.mercadolibre_payments WHERE id = p_payment_id AND organization_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro de cobro Meli no encontrado'; END IF;
  -- Same parent-first lock order as registration and all other Meli writers.
  SELECT * INTO v_sale FROM public.sales_orders WHERE id = v_sale_id
    AND organization_id = p_org_id AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments WHERE organization_id = p_org_id
      AND user_id = p_actor_id AND warehouse_id = v_sale.warehouse_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El depósito de la venta no está asignado al usuario' USING ERRCODE = '42501'; END IF;
  END IF;
  SELECT * INTO STRICT v_payment FROM public.mercadolibre_payments WHERE id = p_payment_id AND organization_id = p_org_id FOR UPDATE;
  IF v_payment.status = 'VOIDED' THEN RETURN QUERY SELECT v_payment.id, true, 'VOIDED'::text; RETURN; END IF;
  UPDATE public.mercadolibre_payments SET status = 'VOIDED', voided_by = p_actor_id,
    voided_at = now(), void_reason = btrim(p_reason) WHERE id = v_payment.id AND organization_id = p_org_id;
  RETURN QUERY SELECT v_payment.id, false, 'VOIDED'::text;
END;
$$;

-- Private projection shared by the authorized single-sale and paginated list RPCs.
CREATE FUNCTION public.meli_payment_sale_summary(p_org_id uuid, p_sale_id uuid DEFAULT NULL)
RETURNS TABLE (sale_id uuid, sale_number bigint, marketplace_order_number text, sale_date date,
  buyer_name text, fiscal_receiver_snapshot jsonb, currency text, total_amount numeric, collected_amount numeric,
  outstanding_amount numeric, collection_status text, sale_status text, arca_status text, invoice_number text,
  warehouse_id uuid, warehouse_name text, has_payment_history boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT s.id, s.sale_number::bigint, s.marketplace_order_number, s.sale_date::date,
    CASE WHEN s.fiscal_receiver_snapshot->>'tax_condition' = 'RESPONSABLE_INSCRIPTO'
      THEN s.fiscal_receiver_snapshot->>'business_name'
      ELSE concat_ws(' ', s.fiscal_receiver_snapshot->>'first_name', s.fiscal_receiver_snapshot->>'last_name') END,
    s.fiscal_receiver_snapshot, s.currency::text, s.total_amount, totals.collected,
    greatest(s.total_amount - totals.collected, 0),
    CASE WHEN totals.collected = 0 THEN 'UNPAID' WHEN totals.collected < s.total_amount THEN 'PARTIAL' ELSE 'PAID' END,
    s.status::text, s.arca_status, s.invoice_number, s.warehouse_id, w.name, totals.history_count > 0
  FROM public.sales_orders s JOIN public.warehouses w ON w.id = s.warehouse_id AND w.organization_id = s.organization_id
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(p.amount) FILTER (WHERE p.status = 'RECORDED'), 0) AS collected, count(*) AS history_count
      FROM public.mercadolibre_payments p WHERE p.organization_id = p_org_id AND p.sales_order_id = s.id
  ) totals ON true
  WHERE s.organization_id = p_org_id AND s.sales_channel = 'MERCADO_LIBRE'
    AND (p_sale_id IS NULL OR s.id = p_sale_id);
$$;

CREATE FUNCTION public.get_mercadolibre_payment_sale(p_org_id uuid, p_actor_id uuid, p_sale_id uuid)
RETURNS TABLE (sale_id uuid, sale_number bigint, marketplace_order_number text, sale_date date,
  buyer_name text, fiscal_receiver_snapshot jsonb, currency text, total_amount numeric, collected_amount numeric,
  outstanding_amount numeric, collection_status text, sale_status text, arca_status text, invoice_number text,
  warehouse_id uuid, warehouse_name text, has_payment_history boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'La consulta requiere el servicio autorizado' USING ERRCODE = '42501'; END IF;
  v_admin := public.assert_meli_payment_access(p_org_id, p_actor_id, false);
  IF p_sale_id IS NULL THEN RAISE EXCEPTION 'Venta Meli requerida' USING ERRCODE = '22023'; END IF;
  RETURN QUERY SELECT summary.* FROM public.meli_payment_sale_summary(p_org_id, p_sale_id) summary
    WHERE (summary.sale_status = 'DELIVERED' OR (summary.sale_status = 'CANCELLED' AND summary.has_payment_history))
      AND (v_admin OR EXISTS (SELECT 1 FROM public.warehouse_user_assignments a
        WHERE a.organization_id = p_org_id AND a.user_id = p_actor_id AND a.warehouse_id = summary.warehouse_id));
END;
$$;

-- Once a collection exists, its monetary/source identity cannot be changed by
-- another elevated sale editor. Fiscal receiver corrections keep their own audit.
CREATE FUNCTION public.guard_meli_sale_with_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.sales_channel = 'MERCADO_LIBRE' AND ROW(NEW.organization_id, NEW.warehouse_id, NEW.currency, NEW.total_amount)
    IS DISTINCT FROM ROW(OLD.organization_id, OLD.warehouse_id, OLD.currency, OLD.total_amount)
    AND EXISTS (SELECT 1 FROM public.mercadolibre_payments p WHERE p.organization_id = OLD.organization_id AND p.sales_order_id = OLD.id) THEN
    RAISE EXCEPTION 'La moneda, el total y el depósito de una venta Meli con cobros registrados no se pueden reemplazar';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_orders_meli_payment_identity BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_sale_with_payments();

CREATE FUNCTION public.list_mercadolibre_payment_sales(
  p_org_id uuid, p_actor_id uuid, p_view text DEFAULT 'PENDING', p_search text DEFAULT '',
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 20,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_currency text DEFAULT NULL
) RETURNS TABLE (sale_id uuid, sale_number bigint, marketplace_order_number text, sale_date date,
  buyer_name text, currency text, total_amount numeric, collected_amount numeric, outstanding_amount numeric,
  collection_status text, sale_status text, arca_status text, invoice_number text, warehouse_id uuid,
  warehouse_name text, has_payment_history boolean, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'La consulta requiere el servicio autorizado' USING ERRCODE = '42501'; END IF;
  v_admin := public.assert_meli_payment_access(p_org_id, p_actor_id, false);
  IF p_view IS NULL OR p_view NOT IN ('PENDING', 'ALL') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR length(coalesce(p_search, '')) > 100
    OR (p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to)
    OR (p_currency IS NOT NULL AND p_currency NOT IN ('ARS', 'USD')) THEN RAISE EXCEPTION 'Filtros de cobros Meli inválidos'; END IF;
  RETURN QUERY
    SELECT summary.sale_id, summary.sale_number, summary.marketplace_order_number, summary.sale_date,
      summary.buyer_name, summary.currency, summary.total_amount, summary.collected_amount, summary.outstanding_amount,
      summary.collection_status, summary.sale_status, summary.arca_status, summary.invoice_number, summary.warehouse_id,
      summary.warehouse_name, summary.has_payment_history, count(*) OVER ()
    FROM public.meli_payment_sale_summary(p_org_id, NULL) summary
    WHERE (summary.sale_status = 'DELIVERED' OR (summary.sale_status = 'CANCELLED' AND summary.has_payment_history))
      AND (p_view = 'ALL' OR (summary.sale_status = 'DELIVERED' AND summary.outstanding_amount > 0))
      AND (p_date_from IS NULL OR summary.sale_date >= p_date_from) AND (p_date_to IS NULL OR summary.sale_date <= p_date_to)
      AND (p_currency IS NULL OR summary.currency = p_currency)
      AND (coalesce(btrim(p_search), '') = '' OR strpos(lower(concat_ws(' ', summary.sale_number::text,
        summary.marketplace_order_number, summary.buyer_name)), lower(btrim(p_search))) > 0)
      AND (v_admin OR EXISTS (SELECT 1 FROM public.warehouse_user_assignments a
        WHERE a.organization_id = p_org_id AND a.user_id = p_actor_id AND a.warehouse_id = summary.warehouse_id))
    ORDER BY summary.sale_date DESC, summary.sale_id DESC LIMIT p_page_size OFFSET (p_page - 1) * p_page_size;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_meli_payment_access(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_mercadolibre_payment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_sale_with_payments() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.meli_payment_sale_summary(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_mercadolibre_payment(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.void_mercadolibre_payment(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_mercadolibre_payment_sale(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_mercadolibre_payment_sales(uuid, uuid, text, text, integer, integer, date, date, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mercadolibre_payment(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_mercadolibre_payment(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mercadolibre_payment_sale(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_mercadolibre_payment_sales(uuid, uuid, text, text, integer, integer, date, date, text) TO service_role;
COMMIT;
