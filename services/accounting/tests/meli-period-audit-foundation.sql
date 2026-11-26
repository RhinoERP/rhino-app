-- Run only against an empty disposable database after 001, 002, 006 and 024-029.
BEGIN;
DO $$
DECLARE
  v_result record;
  v_failed boolean;
BEGIN
  SELECT * INTO v_result FROM accounting.change_meli_posting_period(
    md5('org')::uuid, '2026-03-01', 'UNCONFIGURED', 'OPEN',
    md5('actor')::uuid, 'Apertura de prueba', md5('open')::uuid);
  IF v_result.status <> 'OPEN' OR v_result.idempotent THEN
    RAISE EXCEPTION 'Apertura no confirmada';
  END IF;
  SELECT * INTO v_result FROM accounting.change_meli_posting_period(
    md5('org')::uuid, '2026-03-01', 'UNCONFIGURED', 'OPEN',
    md5('actor')::uuid, 'Apertura de prueba', md5('open')::uuid);
  IF v_result.status <> 'OPEN' OR NOT v_result.idempotent THEN
    RAISE EXCEPTION 'Reintento no idempotente';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.change_meli_posting_period(
      md5('org')::uuid, '2026-03-01', 'UNCONFIGURED', 'OPEN',
      md5('actor')::uuid, 'Motivo diferente', md5('open')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una clave con datos diferentes'; END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.change_meli_posting_period(
      md5('org')::uuid, '2026-03-01', 'UNCONFIGURED', 'CLOSED',
      md5('actor')::uuid, 'Estado anterior', md5('stale')::uuid);
  EXCEPTION WHEN serialization_failure THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un estado anterior obsoleto'; END IF;
  PERFORM accounting.change_meli_posting_period(
    md5('org')::uuid, '2026-03-01', 'OPEN', 'CLOSED',
    md5('actor')::uuid, 'Cierre de prueba', md5('close')::uuid);
  SELECT * INTO v_result FROM accounting.change_meli_posting_period(
    md5('org')::uuid, '2026-03-01', 'UNCONFIGURED', 'OPEN',
    md5('actor')::uuid, 'Apertura de prueba', md5('open')::uuid);
  IF NOT v_result.idempotent OR v_result.status <> 'OPEN' OR
    (SELECT status FROM accounting.meli_posting_periods
      WHERE org_id = md5('org')::uuid AND period_start = '2026-03-01') <> 'CLOSED' THEN
    RAISE EXCEPTION 'Un reintento histórico alteró el cierre';
  END IF;
  IF (SELECT count(*) FROM accounting.meli_posting_period_changes
      WHERE org_id = md5('org')::uuid AND period_start = '2026-03-01') <> 2 THEN
    RAISE EXCEPTION 'Historial de períodos inconsistente';
  END IF;
  BEGIN
    PERFORM accounting.change_meli_posting_period(
      md5('org')::uuid, '2026-03-01', 'CLOSED', 'OPEN',
      md5('actor')::uuid, 'Reapertura prueba', md5('rollback')::uuid);
    RAISE EXCEPTION 'Forzar rollback de la subtransacción';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Forzar rollback de la subtransacción' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM accounting.meli_posting_periods
      WHERE org_id = md5('org')::uuid AND period_start = '2026-03-01') <> 'CLOSED'
    OR EXISTS (SELECT 1 FROM accounting.meli_posting_period_changes
      WHERE request_key = md5('rollback')::uuid) THEN
    RAISE EXCEPTION 'El cambio y su auditoría no se revirtieron juntos';
  END IF;
  PERFORM accounting.change_meli_posting_period(
    md5('other-org')::uuid, '2026-03-01', 'UNCONFIGURED', 'OPEN',
    md5('actor')::uuid, 'Otra organización', md5('other')::uuid);
  IF (SELECT status FROM accounting.meli_posting_periods
      WHERE org_id = md5('org')::uuid AND period_start = '2026-03-01') <> 'CLOSED' THEN
    RAISE EXCEPTION 'El cambio afectó otra organización';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM accounting.change_meli_posting_period(
      md5('org')::uuid, '2026-03-02', 'UNCONFIGURED', 'OPEN',
      md5('actor')::uuid, 'Fecha inválida', md5('bad')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una fecha fuera del inicio del mes'; END IF;
END;
$$;
ROLLBACK;
