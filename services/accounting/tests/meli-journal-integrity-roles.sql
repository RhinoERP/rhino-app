-- Isolated disposable PostgreSQL instance only: this test creates a cluster-wide role.
-- Run after migrations 001, 002, 006 and 024-031.
BEGIN;
CREATE ROLE meli_integrity_writer;
GRANT USAGE ON SCHEMA accounting TO meli_integrity_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.journal_entries,
  accounting.journal_entry_lines TO meli_integrity_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA accounting TO meli_integrity_writer;
CREATE POLICY integrity_test_entries ON accounting.journal_entries
  TO meli_integrity_writer USING (true) WITH CHECK (true);
CREATE POLICY integrity_test_lines ON accounting.journal_entry_lines
  TO meli_integrity_writer USING (true) WITH CHECK (true);
INSERT INTO accounting.chart_of_accounts
  (id, org_id, codigo, nombre, tipo, naturaleza, moneda)
VALUES
  (md5('integrity-debit')::uuid, md5('integrity-org')::uuid, 'I1', 'Debit', 'ACTIVO', 'DEUDORA', 'AMBAS'),
  (md5('integrity-credit')::uuid, md5('integrity-org')::uuid, 'I2', 'Credit', 'ACTIVO', 'DEUDORA', 'AMBAS');
INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
VALUES (md5('integrity-org')::uuid, '2026-07-01', 'OPEN', md5('integrity-actor')::uuid);
SELECT accounting.create_meli_journal_entry(
  md5('integrity-org')::uuid, 'invoice', md5('invoice')::uuid, 'fiscal', md5('invoice-request')::uuid,
  '2026-07-01', 'Meli', md5('integrity-actor')::uuid, 'ARS', 1,
  jsonb_build_array(
    jsonb_build_object('accountId', md5('integrity-debit')::uuid, 'side', 'DEBE', 'originalAmount', '1', 'pesosAmount', '1'),
    jsonb_build_object('accountId', md5('integrity-credit')::uuid, 'side', 'HABER', 'originalAmount', '1', 'pesosAmount', '1')
  )
);
SET LOCAL ROLE meli_integrity_writer;
DO $$
DECLARE v_error text;
BEGIN
  IF has_table_privilege(current_user, 'accounting.meli_journal_requests', 'SELECT')
    OR has_table_privilege(current_user, 'accounting.meli_payment_reversals', 'SELECT') THEN
    RAISE EXCEPTION 'El escritor de prueba accede a recibos privados';
  END IF;
  BEGIN
    UPDATE accounting.journal_entries SET descripcion = 'alterado'
      WHERE idempotency_key = 'meli:journal:' || md5('invoice-request')::uuid::text;
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM;
  END;
  IF v_error IS NULL OR position('no puede modificarse' IN v_error) = 0 THEN
    RAISE EXCEPTION 'No se protegió el asiento para un usuario sin acceso a los recibos';
  END IF;
END;
$$;
INSERT INTO accounting.journal_entries (id, org_id, tipo_evento, fecha, idempotency_key)
VALUES (md5('ordinary-writer')::uuid, md5('integrity-org')::uuid, 'OTHER', '2026-07-01', 'integrity:writer');
INSERT INTO accounting.journal_entry_lines (journal_entry_id, cuenta_id, debe)
VALUES (md5('ordinary-writer')::uuid, md5('integrity-debit')::uuid, 1);
UPDATE accounting.journal_entry_lines SET debe = 2 WHERE journal_entry_id = md5('ordinary-writer')::uuid;
UPDATE accounting.journal_entries SET descripcion = 'actualizado' WHERE id = md5('ordinary-writer')::uuid;
RESET ROLE;
ROLLBACK;
