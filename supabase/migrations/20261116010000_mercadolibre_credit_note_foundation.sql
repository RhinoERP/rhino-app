-- Foundation for fiscal credit notes without inventing a registered customer.
-- Meli writes/readers remain private until their typed service is installed.
BEGIN;

-- Do not silently install ineffective restrictive policies or change wholesale
-- access in an environment whose legacy RLS differs from the expected schema.
DO $$
DECLARE v_table regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.credit_notes'::regclass, 'public.credit_note_items'::regclass,
    'public.credit_note_taxes'::regclass, 'public.credit_note_item_taxes'::regclass,
    'public.credit_note_source_documents'::regclass
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = v_table) THEN
      RAISE EXCEPTION 'Revisar RLS legacy de % antes de instalar el alcance privado Meli', v_table;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.credit_notes
  ADD COLUMN sales_channel text NOT NULL DEFAULT 'WHOLESALE'
    CHECK (sales_channel IN ('WHOLESALE', 'MERCADO_LIBRE')),
  ADD COLUMN fiscal_receiver_snapshot jsonb,
  ADD COLUMN commercial_snapshot jsonb,
  ADD COLUMN marketplace_idempotency_key uuid,
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD CONSTRAINT credit_notes_channel_customer_check CHECK (
    customer_id IS NOT NULL OR sales_channel = 'MERCADO_LIBRE'
  ),
  ADD CONSTRAINT credit_notes_marketplace_fields_check CHECK (
    CASE WHEN sales_channel = 'MERCADO_LIBRE' THEN
      sales_order_id IS NOT NULL
      AND marketplace_idempotency_key IS NOT NULL
      AND public.is_valid_meli_fiscal_receiver(fiscal_receiver_snapshot)
      AND commercial_snapshot IS NOT NULL
      AND jsonb_typeof(commercial_snapshot) = 'object'
      AND amount > 0
      AND invoice_type::text IN ('FACTURA_A', 'FACTURA_A_RETENCION', 'FACTURA_B', 'FACTURA_C')
      AND accounting_informal_entry_id IS NULL
      AND accounting_journal_entry_id IS NULL
      AND NOT is_historical
      AND NOT coalesce(apply_to_receivable, false)
      AND coalesce(applied_to_receivable_amount, 0) = 0
      AND origin_type IN ('RETURN', 'MANUAL_ADJUSTMENT', 'OTHER')
    ELSE fiscal_receiver_snapshot IS NULL AND marketplace_idempotency_key IS NULL END
  );

CREATE UNIQUE INDEX credit_notes_meli_idempotency
  ON public.credit_notes (organization_id, marketplace_idempotency_key)
  WHERE sales_channel = 'MERCADO_LIBRE';

CREATE FUNCTION public.is_meli_credit_note(p_note_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.credit_notes
    WHERE id = p_note_id AND sales_channel = 'MERCADO_LIBRE');
$$;
REVOKE ALL ON FUNCTION public.is_meli_credit_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meli_credit_note(uuid) TO authenticated, service_role;

CREATE FUNCTION public.guard_meli_credit_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale public.sales_orders%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.sales_channel = 'MERCADO_LIBRE' THEN
    IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Las notas de crédito Meli requieren el servicio del canal';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Las notas de crédito Meli se conservan para trazabilidad';
    END IF;
    IF ROW(NEW.organization_id, NEW.sales_channel, NEW.sales_order_id,
      NEW.marketplace_idempotency_key, NEW.customer_id, NEW.fiscal_receiver_snapshot,
      NEW.commercial_snapshot, NEW.amount, NEW.invoice_type, NEW.issue_date,
      NEW.origin_type, NEW.reason, NEW.created_by)
      IS DISTINCT FROM ROW(OLD.organization_id, OLD.sales_channel, OLD.sales_order_id,
      OLD.marketplace_idempotency_key, OLD.customer_id, OLD.fiscal_receiver_snapshot,
      OLD.commercial_snapshot, OLD.amount, OLD.invoice_type, OLD.issue_date,
      OLD.origin_type, OLD.reason, OLD.created_by) THEN
      RAISE EXCEPTION 'La identidad y el contenido de la nota de crédito Meli son inmutables';
    END IF;
    IF OLD.arca_status = 'authorized' AND ROW(
      NEW.arca_status, NEW.arca_cae, NEW.arca_cae_expires_at, NEW.arca_authorized_at,
      NEW.arca_point_of_sale, NEW.arca_voucher_type_code, NEW.arca_voucher_number,
      NEW.arca_request_json, NEW.arca_response_json, NEW.status
    ) IS DISTINCT FROM ROW(
      OLD.arca_status, OLD.arca_cae, OLD.arca_cae_expires_at, OLD.arca_authorized_at,
      OLD.arca_point_of_sale, OLD.arca_voucher_type_code, OLD.arca_voucher_number,
      OLD.arca_request_json, OLD.arca_response_json, OLD.status
    ) THEN RAISE EXCEPTION 'La autorización fiscal Meli no se puede reemplazar'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.sales_channel IS DISTINCT FROM OLD.sales_channel THEN
    RAISE EXCEPTION 'No se puede cambiar el canal de una nota de crédito';
  END IF;
  IF NEW.sales_order_id IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.sales_orders WHERE id = NEW.sales_order_id;
    IF NEW.sales_channel = 'MERCADO_LIBRE' AND NOT FOUND THEN
      RAISE EXCEPTION 'Factura Meli de origen no encontrada';
    END IF;
    IF FOUND AND (v_sale.sales_channel = 'MERCADO_LIBRE' OR NEW.sales_channel = 'MERCADO_LIBRE') THEN
      IF NEW.sales_channel <> 'MERCADO_LIBRE' OR v_sale.sales_channel <> 'MERCADO_LIBRE'
        OR NEW.organization_id IS DISTINCT FROM v_sale.organization_id
        OR NEW.customer_id IS DISTINCT FROM v_sale.customer_id
        OR NEW.invoice_type IS DISTINCT FROM v_sale.invoice_type
        OR NEW.fiscal_receiver_snapshot IS DISTINCT FROM v_sale.fiscal_receiver_snapshot
        OR v_sale.arca_status <> 'authorized' THEN
        RAISE EXCEPTION 'La nota de crédito Meli debe conservar el receptor y la organización de su factura autorizada';
      END IF;
    END IF;
  END IF;
  IF NEW.sales_channel = 'MERCADO_LIBRE' AND coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Las notas de crédito Meli requieren el servicio del canal';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_notes_meli_guard BEFORE INSERT OR UPDATE OR DELETE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note();

-- Legacy definer functions bypass RLS; protect detail writes as well.
CREATE FUNCTION public.guard_meli_credit_note_detail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_ids uuid[] := '{}'; v_note public.credit_notes%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_ids := array_append(v_ids, OLD.credit_note_id); END IF;
  IF TG_OP <> 'DELETE' THEN v_ids := array_append(v_ids, NEW.credit_note_id); END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(v_ids) AS ids(id) ORDER BY id LOOP
    SELECT * INTO v_note FROM public.credit_notes WHERE id = v_id FOR UPDATE;
    IF FOUND AND v_note.sales_channel = 'MERCADO_LIBRE' THEN
      IF coalesce(auth.role(), '') IN ('anon', 'authenticated')
        OR v_note.arca_status IN ('pending', 'authorized') THEN
        RAISE EXCEPTION 'El detalle de esta nota de crédito Meli no se puede modificar';
      END IF;
      IF TG_OP <> 'DELETE' AND NEW.organization_id IS DISTINCT FROM v_note.organization_id THEN
        RAISE EXCEPTION 'El detalle Meli no pertenece a la organización de su nota de crédito';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_note_items_meli_guard BEFORE INSERT OR UPDATE OR DELETE ON public.credit_note_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note_detail();
CREATE TRIGGER credit_note_taxes_meli_guard BEFORE INSERT OR UPDATE OR DELETE ON public.credit_note_taxes
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note_detail();
CREATE TRIGGER credit_note_item_taxes_meli_guard BEFORE INSERT OR UPDATE OR DELETE ON public.credit_note_item_taxes
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note_detail();
CREATE TRIGGER credit_note_source_documents_meli_guard BEFORE INSERT OR UPDATE OR DELETE ON public.credit_note_source_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note_detail();

-- Restrictive policies cannot accidentally widen the existing wholesale grants.
CREATE POLICY credit_notes_meli_private ON public.credit_notes AS RESTRICTIVE FOR ALL TO authenticated
  USING (sales_channel <> 'MERCADO_LIBRE') WITH CHECK (sales_channel <> 'MERCADO_LIBRE');
CREATE POLICY credit_note_items_meli_private ON public.credit_note_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meli_credit_note(credit_note_id)) WITH CHECK (NOT public.is_meli_credit_note(credit_note_id));
CREATE POLICY credit_note_taxes_meli_private ON public.credit_note_taxes AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meli_credit_note(credit_note_id)) WITH CHECK (NOT public.is_meli_credit_note(credit_note_id));
CREATE POLICY credit_note_item_taxes_meli_private ON public.credit_note_item_taxes AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meli_credit_note(credit_note_id)) WITH CHECK (NOT public.is_meli_credit_note(credit_note_id));
CREATE POLICY credit_note_source_documents_meli_private ON public.credit_note_source_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meli_credit_note(credit_note_id)) WITH CHECK (NOT public.is_meli_credit_note(credit_note_id));

-- The subsequent writer must not create spendable customer credit for this channel.
CREATE FUNCTION public.guard_meli_customer_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.credit_note_id IS NOT NULL AND public.is_meli_credit_note(NEW.credit_note_id) THEN
    RAISE EXCEPTION 'Una nota de crédito Meli no genera saldo utilizable en Cobranzas';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_credits_meli_guard BEFORE INSERT OR UPDATE ON public.customer_credits
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_customer_credit();

REVOKE ALL ON FUNCTION public.guard_meli_credit_note() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_credit_note_detail() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_customer_credit() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
