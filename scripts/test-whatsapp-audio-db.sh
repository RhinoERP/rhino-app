#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
audio_container="rhino-audio-test-$$"
trap 'docker stop "$audio_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$audio_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$audio_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$audio_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
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
 docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261104000000_whatsapp_rpc_permissions.sql
 docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261104010000_whatsapp_audio_review_fixes.sql
done
docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/audio.sql
# Simulate a pre-upgrade crash: PROCESSING existed before leases were added.
docker exec "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "UPDATE agent_jobs SET lease_expires_at=NULL WHERE source_message_id=(SELECT id FROM whatsapp_messages WHERE external_message_id='another-conversation');"
docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/20261104010000_whatsapp_audio_review_fixes.sql
docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/audio-review.sql
review_worker_pids=()
for worker in 1 2 3 4; do
 docker exec "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "BEGIN; SELECT id FROM claim_whatsapp_job_v2('parallel-$worker','PROCESS_CONVERSATION'); SELECT pg_sleep(0.2); COMMIT;" > "/tmp/$audio_container-worker-$worker.log" &
 review_worker_pids+=("$!")
done
for worker_pid in "${review_worker_pids[@]}"; do wait "$worker_pid"; done
docker exec -i "$audio_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM agent_jobs WHERE status='PROCESSING')<>4 THEN RAISE EXCEPTION 'Four concurrent consumers did not acquire independent jobs'; END IF;
 IF EXISTS(SELECT 1 FROM agent_jobs WHERE status='PROCESSING' GROUP BY conversation_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Concurrent consumers overlapped a conversation'; END IF;
 IF (SELECT count(DISTINCT organization_id) FROM agent_jobs WHERE status='PROCESSING')<>2 THEN RAISE EXCEPTION 'Tenant capacity or isolation failed'; END IF;
END $$;
SELECT 'Four concurrent PostgreSQL consumers passed';
SQL
