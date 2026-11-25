#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cai_test_container="rhino-cai-test-$$"
trap 'docker stop "$cai_test_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$cai_test_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$cai_test_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for sql_file in scripts/fixtures/cai/bootstrap.sql supabase/migrations/20261123000000_remittance_cai.sql scripts/fixtures/cai/flows.sql; do
  docker exec -i "$cai_test_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < "$sql_file"
done
docker exec "$cai_test_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "SET request.jwt.claim.role='service_role'; BEGIN; SELECT test_issue_cai(); SELECT pg_sleep(1); COMMIT;" &
cai_first_pid=$!
docker exec "$cai_test_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "SET request.jwt.claim.role='service_role'; SELECT test_issue_cai();" &
cai_second_pid=$!
wait "$cai_first_pid"
wait "$cai_second_pid"
docker exec -i "$cai_test_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT next_number FROM remittance_cai_authorizations WHERE state='active')<>5
 OR (SELECT count(*) FROM order_remittances WHERE document_number IN ('00009-00000003','00009-00000004'))<>2
 THEN RAISE EXCEPTION 'Concurrent issuance duplicated or skipped numbers'; END IF;
END; $$;
SELECT 'CAI concurrent issuance checks passed';
SQL
