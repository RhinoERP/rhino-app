-- Meli-only posting guard. No periods are opened by this migration.
BEGIN;

CREATE TABLE accounting.meli_posting_periods (
  org_id uuid NOT NULL,
  period_start date NOT NULL CHECK (EXTRACT(DAY FROM period_start) = 1),
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period_start)
);

ALTER TABLE accounting.meli_posting_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accounting.meli_posting_periods FROM PUBLIC;

CREATE FUNCTION accounting.guard_meli_posting_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_is_meli boolean := false;
  v_status text;
BEGIN
  IF NEW.tipo_evento IN ('MELI_FACTURA', 'MELI_NOTA_CREDITO', 'MELI_COBRO') THEN
    v_is_meli := true;
  ELSIF NEW.tipo_evento = 'CONTRA_ASIENTO'
    AND NEW.referencia_tabla = 'accounting.journal_entries'
    AND NEW.referencia_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM accounting.journal_entries original
      WHERE original.id = NEW.referencia_id
        AND original.tipo_evento IN ('MELI_FACTURA', 'MELI_NOTA_CREDITO', 'MELI_COBRO')
    ) INTO v_is_meli;
  END IF;

  IF NOT v_is_meli THEN
    RETURN NEW;
  END IF;
  IF NEW.org_id IS NULL OR NEW.fecha IS NULL THEN
    RAISE EXCEPTION 'El asiento Meli no tiene organización o fecha';
  END IF;
  SELECT status INTO v_status FROM accounting.meli_posting_periods
    WHERE org_id = NEW.org_id
      AND period_start = date_trunc('month', NEW.fecha::timestamp)::date
    FOR SHARE;
  IF v_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'El período contable Meli está cerrado o no configurado';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION accounting.guard_meli_posting_period() FROM PUBLIC;
CREATE TRIGGER meli_posting_period_guard
  BEFORE INSERT ON accounting.journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_meli_posting_period();

COMMIT;
