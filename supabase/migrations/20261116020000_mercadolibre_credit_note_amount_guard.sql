-- Serialize credit reservations on the source invoice. A browser/server check
-- alone cannot prevent two concurrent notes from exceeding the invoice total.
BEGIN;
CREATE FUNCTION public.guard_meli_credit_note_amount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale public.sales_orders%ROWTYPE; v_reserved numeric;
BEGIN
  IF NEW.sales_channel <> 'MERCADO_LIBRE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
    IF OLD.arca_status = 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'No se puede cancelar una NC Meli con resultado fiscal pendiente';
    END IF;
  END IF;
  IF NEW.status <> 'CONFIRMED' THEN RETURN NEW; END IF;
  SELECT * INTO v_sale FROM public.sales_orders
    WHERE id = NEW.sales_order_id AND organization_id = NEW.organization_id
      AND sales_channel = 'MERCADO_LIBRE' FOR UPDATE;
  IF NOT FOUND OR v_sale.arca_status <> 'authorized' THEN
    RAISE EXCEPTION 'La nota de crédito Meli requiere una factura de origen autorizada';
  END IF;
  SELECT coalesce(sum(n.amount), 0) INTO v_reserved FROM public.credit_notes n
    WHERE n.organization_id = NEW.organization_id AND n.sales_order_id = NEW.sales_order_id
      AND n.status = 'CONFIRMED' AND n.id IS DISTINCT FROM NEW.id;
  IF NEW.amount <> trunc(NEW.amount, 2) OR NEW.amount <= 0
    OR v_reserved + NEW.amount > v_sale.total_amount THEN
    RAISE EXCEPTION 'El importe supera el saldo disponible de la factura Meli';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_notes_meli_amount_guard BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note_amount();
REVOKE ALL ON FUNCTION public.guard_meli_credit_note_amount() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
