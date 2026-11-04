#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
audio_container="rhino-audio-test-$$"
trap 'docker stop "$audio_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$audio_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$audio_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for sql_file in scripts/fixtures/whatsapp/bootstrap.sql \
 supabase/migrations/20260902000000_create_whatsapp_agent_foundation.sql \
 supabase/migrations/20260902010000_add_whatsapp_channel_functions.sql \
 supabase/migrations/20260907000000_prevent_duplicate_whatsapp_pre_sales.sql \
 supabase/migrations/20261017010000_whatsapp_business_hours_and_response_delay.sql \
 supabase/migrations/20261026000000_gate_whatsapp_modules.sql \
 supabase/migrations/20261027000000_whatsapp_recurring_orders.sql; do
 docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < "$sql_file"
done
docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects(bucket_id text,name text);
SQL
for attempt in 1 2; do
 docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261103000000_whatsapp_audio_pipeline.sql
done
docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/audio.sql
