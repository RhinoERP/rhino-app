-- Protect linked Meli receipts from ordinary journal mutations. This does not
-- reconcile external entries or prevent a database owner disabling triggers.
BEGIN;

CREATE FUNCTION accounting.is_linked_meli_journal_entry(p_entry_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounting.meli_journal_requests WHERE journal_entry_id = p_entry_id
    UNION ALL
    SELECT 1 FROM accounting.meli_payment_reversals WHERE reversal_entry_id = p_entry_id
  );
$$;

CREATE FUNCTION accounting.lock_meli_journal_integrity(p_first uuid, p_second uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN SELECT DISTINCT id FROM unnest(ARRAY[p_first, p_second]) AS ids(id)
    WHERE id IS NOT NULL ORDER BY id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('meli-journal-integrity:' || v_id::text, 0)
    );
  END LOOP;
END;
$$;

CREATE FUNCTION accounting.guard_meli_journal_creation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.tipo_evento IN ('MELI_FACTURA', 'MELI_NOTA_CREDITO', 'MELI_COBRO') THEN
    PERFORM accounting.lock_meli_journal_integrity(NEW.id, NULL);
  ELSIF NEW.tipo_evento = 'CONTRA_ASIENTO'
    AND NEW.referencia_tabla = 'accounting.journal_entries' THEN
    PERFORM accounting.lock_meli_journal_integrity(NEW.id, NEW.referencia_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER a_meli_journal_creation_guard
  BEFORE INSERT ON accounting.journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_meli_journal_creation();

CREATE FUNCTION accounting.guard_linked_meli_journal_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF accounting.is_linked_meli_journal_entry(OLD.id) THEN
    RAISE EXCEPTION 'Un asiento Meli vinculado no puede modificarse ni eliminarse';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER linked_meli_journal_entry_guard
  BEFORE UPDATE OR DELETE ON accounting.journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_linked_meli_journal_entry();

CREATE FUNCTION accounting.guard_linked_meli_journal_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_id := OLD.journal_entry_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_id := NEW.journal_entry_id; END IF;
  PERFORM accounting.lock_meli_journal_integrity(v_old_id, v_new_id);
  PERFORM 1 FROM accounting.journal_entries
    WHERE (id = v_old_id OR id = v_new_id)
      AND tipo_evento IN ('MELI_FACTURA', 'MELI_NOTA_CREDITO', 'MELI_COBRO', 'CONTRA_ASIENTO')
    ORDER BY id FOR UPDATE;
  IF accounting.is_linked_meli_journal_entry(v_old_id)
    OR accounting.is_linked_meli_journal_entry(v_new_id) THEN
    RAISE EXCEPTION 'Las líneas de un asiento Meli vinculado son inmutables';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER linked_meli_journal_line_guard
  BEFORE INSERT OR UPDATE OR DELETE ON accounting.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_linked_meli_journal_line();

CREATE FUNCTION accounting.guard_linked_meli_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Un recibo contable Meli vinculado es inmutable';
END;
$$;

CREATE TRIGGER meli_journal_request_immutable
  BEFORE UPDATE OR DELETE ON accounting.meli_journal_requests
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_linked_meli_receipt();
CREATE TRIGGER meli_payment_reversal_immutable
  BEFORE UPDATE OR DELETE ON accounting.meli_payment_reversals
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_linked_meli_receipt();

CREATE FUNCTION accounting.guard_meli_fiscal_contra_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_type text;
BEGIN
  IF NEW.tipo_evento IS DISTINCT FROM 'CONTRA_ASIENTO'
    OR NEW.referencia_tabla IS DISTINCT FROM 'accounting.journal_entries'
    OR NEW.referencia_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tipo_evento INTO v_type FROM accounting.journal_entries
    WHERE id = NEW.referencia_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El original del contra-asiento no existe o no es visible en esta transacción';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('MELI_FACTURA', 'MELI_NOTA_CREDITO', 'CONTRA_ASIENTO') THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM accounting.journal_entries WHERE id = NEW.referencia_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM accounting.meli_journal_requests
    WHERE journal_entry_id = NEW.referencia_id
      AND origin_type IN ('invoice', 'creditNote')
  ) OR EXISTS (
    SELECT 1 FROM accounting.meli_payment_reversals WHERE reversal_entry_id = NEW.referencia_id
  ) THEN
    RAISE EXCEPTION 'Un asiento fiscal o contra-asiento Meli requiere revisión; no admite reversión genérica';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meli_fiscal_contra_entry_guard
  BEFORE INSERT ON accounting.journal_entries
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_meli_fiscal_contra_entry();

REVOKE ALL ON FUNCTION accounting.is_linked_meli_journal_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting.lock_meli_journal_integrity(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting.guard_meli_journal_creation() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting.guard_linked_meli_journal_entry() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting.guard_linked_meli_journal_line() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting.guard_linked_meli_receipt() FROM PUBLIC;
REVOKE ALL ON FUNCTION accounting.guard_meli_fiscal_contra_entry() FROM PUBLIC;
COMMIT;
