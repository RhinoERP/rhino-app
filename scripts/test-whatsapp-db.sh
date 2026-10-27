#!/usr/bin/env bash
# Uses a disposable PostgreSQL container; never connects to a deployed Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
whatsapp_db_container="rhino-whatsapp-test-$$"
trap 'docker stop "$whatsapp_db_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$whatsapp_db_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$whatsapp_db_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for sql_file in \
  scripts/fixtures/whatsapp/bootstrap.sql \
  supabase/migrations/20260902000000_create_whatsapp_agent_foundation.sql \
  supabase/migrations/20260902010000_add_whatsapp_channel_functions.sql \
  supabase/migrations/20260907000000_prevent_duplicate_whatsapp_pre_sales.sql \
  supabase/migrations/20261017010000_whatsapp_business_hours_and_response_delay.sql \
  supabase/migrations/20261026000000_gate_whatsapp_modules.sql \
  supabase/migrations/20261027000000_whatsapp_recurring_orders.sql \
  scripts/fixtures/whatsapp/module-gates.sql \
  scripts/fixtures/whatsapp/recurring-orders.sql; do
  docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < "$sql_file"
done

# Verify the targeted deploy bundle against an empty and an existing foundation.
docker exec "$whatsapp_db_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "BEGIN; SELECT run_whatsapp_concurrency_test(); SELECT pg_sleep(1); COMMIT;" &
whatsapp_first_pid=$!
docker exec "$whatsapp_db_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "SELECT run_whatsapp_concurrency_test();" &
whatsapp_second_pid=$!
wait "$whatsapp_first_pid"
wait "$whatsapp_second_pid"
docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM sales_orders WHERE whatsapp_cart_id=(SELECT cart_id FROM whatsapp_concurrency_fixture)) <> 1 THEN RAISE EXCEPTION 'Concurrent conversion duplicated sale'; END IF;
 IF (SELECT count(*) FROM sales_order_items WHERE sales_order_id=(SELECT id FROM sales_orders WHERE whatsapp_cart_id=(SELECT cart_id FROM whatsapp_concurrency_fixture))) <> 1 THEN RAISE EXCEPTION 'Concurrent conversion duplicated items'; END IF;
END $$;
SELECT 'WhatsApp concurrent conversion checks passed';
SQL

docker exec "$whatsapp_db_container" createdb -U postgres whatsapp_bundle
docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/bootstrap.sql
for pass in 1 2; do
  node scripts/build-whatsapp-release-sql.mjs | docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1
done
docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/module-gates.sql

docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/recurring-orders.sql
# A full rerun must not recreate the old one-sale-per-chat unique index.
node scripts/build-whatsapp-release-sql.mjs | docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1

# Upgrade existing pre-sales, rather than testing only empty tables.
docker exec "$whatsapp_db_container" createdb -U postgres whatsapp_legacy
for sql_file in \
  scripts/fixtures/whatsapp/bootstrap.sql \
  supabase/migrations/20260902000000_create_whatsapp_agent_foundation.sql \
  supabase/migrations/20260902010000_add_whatsapp_channel_functions.sql \
  supabase/migrations/20260907000000_prevent_duplicate_whatsapp_pre_sales.sql \
  supabase/migrations/20261017010000_whatsapp_business_hours_and_response_delay.sql \
  supabase/migrations/20261026000000_gate_whatsapp_modules.sql \
  scripts/fixtures/whatsapp/module-gates.sql \
  scripts/fixtures/whatsapp/legacy-orders.sql \
  supabase/migrations/20261027000000_whatsapp_recurring_orders.sql; do
  docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_legacy -v ON_ERROR_STOP=1 --single-transaction < "$sql_file"
done
docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_legacy -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM sales_orders WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND whatsapp_cart_id='88888888-8888-4888-8888-888888888888')
 OR NOT EXISTS(SELECT 1 FROM conversation_carts WHERE id='88888888-8888-4888-8888-888888888888' AND status='CONVERTED') THEN RAISE EXCEPTION 'Legacy backfill failed'; END IF;
END $$;
-- Simulate corrupt legacy data. The next migration must fail without guessing.
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','5491199999999');
INSERT INTO sales_orders(id,organization_id,source,conversation_id)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','WHATSAPP','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SQL
if docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_legacy -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261027000000_whatsapp_recurring_orders.sql; then
  echo "FAIL: inconsistent legacy data was silently migrated" >&2
  exit 1
fi
echo "WhatsApp legacy backfill and inconsistent-data checks passed"
