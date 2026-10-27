-- Las operaciones habituales de Cobranzas no pueden deshacer o alterar un
-- cobro con cheque. El rechazo transaccional de Tesorería conecta como postgres
-- y necesita poder borrar el cobro después de reabrir la deuda.
-- Una compensación por creación fallida puede borrar un pago aún no vinculado.
CREATE OR REPLACE FUNCTION public.protect_received_check_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, accounting, pg_temp
AS $$
DECLARE
  v_linked boolean;
BEGIN
  -- El servicio contable usa una conexión directa, sin JWT de Supabase.
  IF auth.role() IS DISTINCT FROM 'authenticated'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM accounting.received_checks AS check_row
    WHERE check_row.receivable_payment_id = OLD.id
      AND check_row.org_id = OLD.organization_id
  ) INTO v_linked;

  IF TG_OP = 'DELETE' THEN
    IF v_linked THEN
      RAISE EXCEPTION 'Los cobros vinculados a cheques se gestionan desde Tesorería'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF v_linked
     OR OLD.payment_method::text IN ('cheque', 'e-cheq')
     OR NEW.payment_method::text IN ('cheque', 'e-cheq') THEN
    -- Registrar el asiento o generar/descargar un recibo siguen siendo válidos.
    -- El resto del cobro (incluidos método, importe y estado) es inmutable.
    IF (to_jsonb(NEW) - ARRAY[
          'accounting_informal_entry_id', 'accounting_journal_entry_id',
          'receipt_number', 'receipt_pdf_url'
        ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
          'accounting_informal_entry_id', 'accounting_journal_entry_id',
          'receipt_number', 'receipt_pdf_url'
        ]) THEN
      RAISE EXCEPTION 'Los cobros con cheque o e-cheq no se pueden editar'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_received_check_payment_trigger
  ON public.receivable_payments;
CREATE TRIGGER protect_received_check_payment_trigger
  BEFORE UPDATE OR DELETE ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_received_check_payment();
