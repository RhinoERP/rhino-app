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
  scripts/fixtures/whatsapp/module-gates.sql; do
  docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < "$sql_file"
done

# Verify the targeted deploy bundle against an empty and an existing foundation.
docker exec "$whatsapp_db_container" createdb -U postgres whatsapp_bundle
docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/bootstrap.sql
for pass in 1 2; do
  node scripts/build-whatsapp-release-sql.mjs | docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1
done
docker exec -i "$whatsapp_db_container" psql -XqAt -U postgres -d whatsapp_bundle -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/module-gates.sql
