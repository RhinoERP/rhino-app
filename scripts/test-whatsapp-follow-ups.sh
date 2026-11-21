#!/usr/bin/env bash
# Disposable PostgreSQL only; never reads environment files or deployed DB URLs.
set -euo pipefail
cd "$(dirname "$0")/.."
follow_up_container="rhino-follow-ups-$$"
trap 'docker stop "$follow_up_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$follow_up_container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$follow_up_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for sql_file in scripts/fixtures/whatsapp/bootstrap.sql \
  supabase/migrations/20260701000000_create_notifications.sql \
  supabase/migrations/20260703000000_add_notification_archiving.sql; do
  docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < "$sql_file"
done
docker exec "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "ALTER TABLE organizations ADD COLUMN name text DEFAULT 'Empresa de prueba'"
# Applying the complete release twice catches migration compatibility problems.
for pass in 1 2; do
  node scripts/build-whatsapp-release-sql.mjs | docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1
done
docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 < scripts/fixtures/whatsapp/follow-ups.sql

# Independent backend sessions prove SKIP LOCKED has one winner and that the
# final preflight waits for, then observes, a concurrently arriving customer reply.
follow_up_logs=$(mktemp -d /tmp/rhino-follow-up-race.XXXXXX)
docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE follow_up_race AS SELECT gen_random_uuid() org,gen_random_uuid() wi,gen_random_uuid() actor,
  gen_random_uuid() list,gen_random_uuid() chat,gen_random_uuid() inbound,gen_random_uuid() outbound;
INSERT INTO organizations(id,whatsapp_enabled) SELECT org,true FROM follow_up_race;
INSERT INTO auth.users(id) SELECT actor FROM follow_up_race;
INSERT INTO organization_members(organization_id,user_id,is_owner) SELECT org,actor,true FROM follow_up_race;
INSERT INTO sales_price_lists(id,organization_id) SELECT list,org FROM follow_up_race;
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id,follow_up)
  SELECT wi,org,'follow-up-race','ACTIVE',list,actor,'{"enabled":true,"delayMinutes":30,"instructions":"Ayudá"}'::jsonb FROM follow_up_race;
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone)
  SELECT chat,org,wi,'5491112345678' FROM follow_up_race;
INSERT INTO whatsapp_messages(id,organization_id,integration_id,conversation_id,external_message_id,direction,content,payload)
  SELECT inbound,org,wi,chat,'race-inbound','INBOUND','Consulta comercial',jsonb_build_object('id','race-inbound','timestamp',floor(extract(epoch FROM clock_timestamp()))::text) FROM follow_up_race;
INSERT INTO whatsapp_messages(id,organization_id,integration_id,conversation_id,external_message_id,direction,origin,content,delivery_status)
  SELECT outbound,org,wi,chat,'race-outbound','OUTBOUND','AGENT','Respuesta comercial','SENT' FROM follow_up_race;
INSERT INTO whatsapp_follow_ups(organization_id,integration_id,conversation_id,source_message_id,inbound_message_id,control_version,state_key,pricing_context,available_at)
  SELECT org,wi,chat,outbound,inbound,0,whatsapp_follow_up_state_key(chat),whatsapp_pricing_context(org,wi,chat),clock_timestamp()-interval '1 minute' FROM follow_up_race;
SQL
docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 > "$follow_up_logs/claim-a.log" <<'SQL' &
BEGIN;
SELECT claim_whatsapp_follow_up();
\echo follow-up-lock-held
SELECT pg_sleep(1);
COMMIT;
SQL
follow_up_first_pid=$!
for attempt in {1..100}; do
  if rg -q 'follow-up-lock-held' "$follow_up_logs/claim-a.log"; then break; fi
  sleep 0.05
done
rg -q 'follow-up-lock-held' "$follow_up_logs/claim-a.log"
docker exec "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "SELECT claim_whatsapp_follow_up() IS NULL" > "$follow_up_logs/claim-b.log"
wait "$follow_up_first_pid"
rg -qx t "$follow_up_logs/claim-b.log"
docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT prepare_whatsapp_follow_up(id,lease_token,'¿Te quedó alguna duda?','Consulta abierta') IS NOT NULL FROM whatsapp_follow_ups;
SQL
docker exec -i "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 > "$follow_up_logs/reply.log" <<'SQL' &
BEGIN;
INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content)
  SELECT org,wi,chat,'race-new-reply','INBOUND','Ya elegí' FROM follow_up_race;
\echo reply-lock-held
SELECT pg_sleep(1);
COMMIT;
SQL
follow_up_first_pid=$!
for attempt in {1..100}; do
  if rg -q 'reply-lock-held' "$follow_up_logs/reply.log"; then break; fi
  sleep 0.05
done
rg -q 'reply-lock-held' "$follow_up_logs/reply.log"
docker exec "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "SELECT guard_whatsapp_follow_up_dispatch(id,lease_token,'follow-up-race','5491112345678') IS NULL FROM whatsapp_outbox WHERE follow_up_id IS NOT NULL" > "$follow_up_logs/guard.log"
wait "$follow_up_first_pid"
rg -qx t "$follow_up_logs/guard.log"
docker exec "$follow_up_container" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF NOT EXISTS(SELECT 1 FROM whatsapp_follow_ups WHERE status='CANCELLED') OR NOT EXISTS(SELECT 1 FROM whatsapp_outbox WHERE status='CANCELLED') THEN RAISE EXCEPTION 'Concurrent reply did not cancel dispatch'; END IF; END \$\$"
printf 'WhatsApp follow-up concurrency checks passed\n'
