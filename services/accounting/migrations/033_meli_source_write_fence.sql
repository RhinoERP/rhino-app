-- Serialize Meli posting with all writers that reference a Meli source.
-- Writers targeting these source tables must use the same transaction lock.
BEGIN;

CREATE FUNCTION accounting.lock_meli_source_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_meli boolean;
BEGIN
  IF NEW.org_id IS NULL OR NEW.referencia_tabla IS NULL
    OR NEW.referencia_tabla NOT IN (
    'sales_orders', 'credit_notes', 'mercadolibre_payments'
  ) OR NEW.referencia_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_meli := NEW.tipo_evento IN (
    'MELI_FACTURA', 'MELI_NOTA_CREDITO', 'MELI_COBRO'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'meli-source:' || NEW.org_id::text || ':' ||
      NEW.referencia_tabla || ':' || NEW.referencia_id::text,
      0
    )
  );

  IF v_is_meli THEN
    IF EXISTS (
      SELECT 1
      FROM accounting.journal_entries e
      WHERE e.org_id = NEW.org_id
        AND e.referencia_tabla = NEW.referencia_tabla
        AND e.referencia_id = NEW.referencia_id
        AND NOT EXISTS (
          SELECT 1 FROM accounting.meli_journal_requests r
          WHERE r.org_id = NEW.org_id AND r.journal_entry_id = e.id
        )
    ) THEN
      RAISE EXCEPTION
        'El origen Meli tiene asientos previos sin vínculo verificable; requiere conciliación'
        USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM accounting.meli_journal_requests r
    WHERE r.org_id = NEW.org_id
      AND r.origin_id = NEW.referencia_id
      AND r.origin_type = CASE NEW.referencia_tabla
        WHEN 'sales_orders' THEN 'invoice'
        WHEN 'credit_notes' THEN 'creditNote'
        WHEN 'mercadolibre_payments' THEN 'payment'
      END
  ) THEN
    RAISE EXCEPTION
      'El origen ya tiene un asiento Meli vinculado; usar su flujo de reversión'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION accounting.lock_meli_source_write() FROM PUBLIC;
CREATE TRIGGER b_meli_source_write_fence
  BEFORE INSERT ON accounting.journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.lock_meli_source_write();

COMMIT;
