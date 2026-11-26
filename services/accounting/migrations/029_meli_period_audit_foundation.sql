-- Internal foundation only: callers must authorize the actor before use.
BEGIN;

CREATE TABLE accounting.meli_posting_period_changes (
  request_key uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  period_start date NOT NULL CHECK (EXTRACT(DAY FROM period_start) = 1),
  previous_status text NOT NULL CHECK (previous_status IN ('UNCONFIGURED', 'OPEN', 'CLOSED')),
  new_status text NOT NULL CHECK (new_status IN ('OPEN', 'CLOSED')),
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_status <> new_status)
);

CREATE INDEX meli_posting_period_changes_history
  ON accounting.meli_posting_period_changes (org_id, period_start, changed_at, request_key);
ALTER TABLE accounting.meli_posting_period_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accounting.meli_posting_period_changes FROM PUBLIC;

CREATE FUNCTION accounting.change_meli_posting_period(
  p_org_id uuid, p_period_start date, p_expected_status text, p_new_status text,
  p_actor_id uuid, p_reason text, p_request_key uuid
) RETURNS TABLE (status text, idempotent boolean)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_existing accounting.meli_posting_period_changes%ROWTYPE;
  v_current text;
BEGIN
  IF p_org_id IS NULL OR p_period_start IS NULL
    OR EXTRACT(DAY FROM p_period_start) <> 1
    OR p_expected_status IS NULL OR p_expected_status NOT IN ('UNCONFIGURED', 'OPEN', 'CLOSED')
    OR p_new_status IS NULL OR p_new_status NOT IN ('OPEN', 'CLOSED')
    OR p_expected_status = p_new_status OR p_actor_id IS NULL OR p_request_key IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_reason <> btrim(p_reason) THEN
    RAISE EXCEPTION 'Datos del cambio de período Meli inválidos' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meli-period-request:' || p_request_key::text, 0)
  );
  SELECT * INTO v_existing FROM accounting.meli_posting_period_changes
    WHERE request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.org_id IS DISTINCT FROM p_org_id
      OR v_existing.period_start IS DISTINCT FROM p_period_start
      OR v_existing.previous_status IS DISTINCT FROM p_expected_status
      OR v_existing.new_status IS DISTINCT FROM p_new_status
      OR v_existing.actor_id IS DISTINCT FROM p_actor_id
      OR v_existing.reason IS DISTINCT FROM p_reason THEN
      RAISE EXCEPTION 'La clave ya corresponde a otro cambio de período' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.new_status, true;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-period:' || p_org_id::text || ':' || p_period_start::text, 0
  ));
  SELECT period.status INTO v_current FROM accounting.meli_posting_periods period
    WHERE period.org_id = p_org_id AND period.period_start = p_period_start
    FOR UPDATE;
  v_current := COALESCE(v_current, 'UNCONFIGURED');
  IF v_current <> p_expected_status THEN
    RAISE EXCEPTION 'El período Meli cambió; consultá su estado antes de reintentar'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO accounting.meli_posting_periods (org_id, period_start, status, changed_by)
  VALUES (p_org_id, p_period_start, p_new_status, p_actor_id)
  ON CONFLICT (org_id, period_start) DO UPDATE
    SET status = EXCLUDED.status, changed_by = EXCLUDED.changed_by, changed_at = now();
  INSERT INTO accounting.meli_posting_period_changes (
    request_key, org_id, period_start, previous_status, new_status, actor_id, reason
  ) VALUES (
    p_request_key, p_org_id, p_period_start, v_current, p_new_status, p_actor_id, p_reason
  );
  RETURN QUERY SELECT p_new_status, false;
END;
$$;

REVOKE ALL ON FUNCTION accounting.change_meli_posting_period(uuid, date, text, text, uuid, text, uuid)
  FROM PUBLIC;
COMMIT;
