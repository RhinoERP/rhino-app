#!/usr/bin/env bash
# Native PostgreSQL, private Unix socket, disposable cluster. Never reads DB URLs.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${WHATSAPP_PG_BIN:-}" ]]; then export PATH="$WHATSAPP_PG_BIN:$PATH"; fi
for binary in initdb pg_ctl psql createdb; do command -v "$binary" >/dev/null; done
task_pg_dir=$(mktemp -d /tmp/rhino-human-control.XXXXXX)
trap 'pg_ctl -D "$task_pg_dir/data" -m fast -w stop > "$task_pg_dir/stop.log" 2>&1 || true; printf "PostgreSQL logs: %s\n" "$task_pg_dir"' EXIT
initdb -D "$task_pg_dir/data" -U postgres --auth=trust --no-locale -E UTF8 > "$task_pg_dir/init.log"
pg_ctl -D "$task_pg_dir/data" -l "$task_pg_dir/server.log" -o "-k $task_pg_dir -h '' -p 55492" -w start > "$task_pg_dir/start.log"
export PGHOST="$task_pg_dir" PGPORT=55492 PGUSER=postgres PGDATABASE=postgres
unset PGSERVICE PGSERVICEFILE PGOPTIONS
run_sql() { psql -XqAt -v ON_ERROR_STOP=1 "$@"; }
node scripts/build-whatsapp-release-sql.mjs > "$task_pg_dir/release.sql"
run_sql -f scripts/fixtures/whatsapp/bootstrap.sql > "$task_pg_dir/bootstrap.log" 2>&1
# Upgrade real pre-control rows, including a HANDOFF that was never accepted.
node --input-type=module - "$task_pg_dir/release.sql" "$task_pg_dir/legacy.sql" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync(process.argv[2], 'utf8');
const boundary = source.indexOf('-- Phase 1: human control only.');
assert.ok(boundary > 0);
writeFileSync(process.argv[3], source.slice(0, boundary) + '\nCOMMIT;\n');
JS
run_sql -f "$task_pg_dir/legacy.sql" > "$task_pg_dir/legacy.log" 2>&1
run_sql <<'SQL'
CREATE TABLE control_legacy_fixture AS SELECT gen_random_uuid() org,gen_random_uuid() actor,gen_random_uuid() wi,gen_random_uuid() chat,gen_random_uuid() cart;
INSERT INTO organizations(id,whatsapp_enabled) SELECT org,true FROM control_legacy_fixture;
INSERT INTO auth.users(id) SELECT actor FROM control_legacy_fixture;
INSERT INTO organization_members(organization_id,user_id) SELECT org,actor FROM control_legacy_fixture;
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id) SELECT wi,org,'legacy-control' FROM control_legacy_fixture;
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone,status,assigned_user_id)
  SELECT chat,org,wi,'legacy-control','HANDOFF',actor FROM control_legacy_fixture;
INSERT INTO conversation_carts(id,organization_id,conversation_id) SELECT cart,org,chat FROM control_legacy_fixture;
GRANT SELECT(payload) ON whatsapp_messages TO authenticated;
CREATE POLICY legacy_bypass ON whatsapp_conversations FOR ALL TO authenticated USING(true) WITH CHECK(true);
SQL
for pass in 1 2; do run_sql -f "$task_pg_dir/release.sql" > "$task_pg_dir/release-$pass.log" 2>&1; done
run_sql <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM whatsapp_conversations c JOIN control_legacy_fixture f ON c.id=f.chat
   WHERE c.status='HANDOFF' AND c.assigned_user_id=f.actor AND c.human_claimed_at IS NULL AND c.control_version=0)
   OR NOT EXISTS(SELECT 1 FROM conversation_carts c JOIN control_legacy_fixture f ON c.id=f.cart AND c.status='OPEN')
   OR has_column_privilege('authenticated','whatsapp_messages','payload','SELECT') THEN
   RAISE EXCEPTION 'Upgrade inferred acceptance, lost data or retained a column grant';
 END IF;
END $$;
SQL
run_sql -f scripts/fixtures/whatsapp/human-control.sql > "$task_pg_dir/control.log" 2>&1 || { cat "$task_pg_dir/control.log"; exit 1; }

# Simulate a model already running for both lock orders below.
run_sql <<'SQL'
INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content)
  SELECT f.org,f.wi,chat,chat::text,'INBOUND','Hola' FROM whatsapp_control_fixture f
  CROSS JOIN LATERAL (VALUES(f.race_c),(f.sending_race_c)) v(chat);
INSERT INTO agent_jobs(organization_id,integration_id,conversation_id,source_message_id,status,job_type,execution_mode,lease_token,lease_expires_at)
  SELECT m.organization_id,m.integration_id,m.conversation_id,m.id,'PROCESSING','PROCESS_CONVERSATION','DAEMON',gen_random_uuid(),clock_timestamp()+interval '180 seconds'
  FROM whatsapp_messages m JOIN whatsapp_control_fixture f ON m.conversation_id IN (f.race_c,f.sending_race_c);
SQL

# Two backend sessions contend for one conversation/version. Session A holds
# the row until B is started; the marker is emitted after the lock is acquired.
run_sql > "$task_pg_dir/claim-a.log" <<'SQL' &
BEGIN;
SELECT control_whatsapp_conversation(org,race_c,a,0,'CLAIM') FROM whatsapp_control_fixture;
\echo claim-lock-held
SELECT pg_sleep(1);
COMMIT;
SQL
first_pid=$!
for attempt in {1..100}; do if rg -q 'claim-lock-held' "$task_pg_dir/claim-a.log"; then break; fi; sleep 0.05; done
rg -q 'claim-lock-held' "$task_pg_dir/claim-a.log"
run_sql -c "SELECT control_whatsapp_conversation(org,race_c,b,0,'CLAIM') FROM whatsapp_control_fixture" > "$task_pg_dir/claim-b.log" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
run_sql <<'SQL'
DO $$ DECLARE f whatsapp_control_fixture%ROWTYPE; result jsonb; BEGIN
 SELECT * INTO f FROM whatsapp_control_fixture;
 IF NOT EXISTS(SELECT 1 FROM whatsapp_conversations WHERE id=f.race_c AND assigned_user_id=f.a AND control_version=1 AND human_claimed_at IS NOT NULL)
   OR (SELECT count(*) FROM whatsapp_conversation_events WHERE conversation_id=f.race_c)<>1 THEN RAISE EXCEPTION 'Concurrent claim did not have one winner'; END IF;
 SELECT prepare_whatsapp_outbox(j.id,j.lease_token,'Respuesta generada antes de la toma') INTO result FROM agent_jobs j WHERE conversation_id=f.race_c;
 IF result->>'status'<>'CANCELLED' THEN RAISE EXCEPTION 'Claim-before-reservation allowed an automatic send'; END IF;
END $$;
SQL
# Also assert the losing caller received a conflict, not a false success.
node --input-type=module - "$task_pg_dir/claim-b.log" <<'JS'
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8').trim());
assert.equal(response.success, false);
assert.equal(response.code, 'CONFLICT');
assert.equal(response.control.controlVersion, 1);
JS

run_sql > "$task_pg_dir/reserve.log" <<'SQL' &
BEGIN;
SELECT prepare_whatsapp_outbox(j.id,j.lease_token,'Ya reservado') FROM agent_jobs j JOIN whatsapp_control_fixture f ON j.conversation_id=f.sending_race_c;
\echo reserve-lock-held
SELECT pg_sleep(1);
COMMIT;
SQL
first_pid=$!
for attempt in {1..100}; do if rg -q 'reserve-lock-held' "$task_pg_dir/reserve.log"; then break; fi; sleep 0.05; done
rg -q 'reserve-lock-held' "$task_pg_dir/reserve.log"
run_sql -c "SELECT control_whatsapp_conversation(org,sending_race_c,b,0,'CLAIM') FROM whatsapp_control_fixture" > "$task_pg_dir/claim-after-reserve.log" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
node --input-type=module - "$task_pg_dir/claim-after-reserve.log" <<'JS'
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8').trim());
assert.equal(response.success, true);
assert.equal(response.control.deliveryBlock, 'SENDING');
assert.equal(response.control.controlVersion, 1);
JS

# Regression suites live in separate DBs because their fixtures share fixed IDs.
for suite in recurring audio; do
  createdb "$suite"
  export PGDATABASE="$suite"
  run_sql -f scripts/fixtures/whatsapp/bootstrap.sql > "$task_pg_dir/$suite-bootstrap.log" 2>&1
  run_sql -f "$task_pg_dir/release.sql" > "$task_pg_dir/$suite-release.log" 2>&1
  if [[ "$suite" == recurring ]]; then
    run_sql -f scripts/fixtures/whatsapp/module-gates.sql > "$task_pg_dir/gates.log" 2>&1
    run_sql -f scripts/fixtures/whatsapp/recurring-orders.sql > "$task_pg_dir/recurring.log" 2>&1
    # Reapply after the legacy fixture's test-only grants; verify populated upgrade.
    run_sql -f "$task_pg_dir/release.sql" > "$task_pg_dir/populated-upgrade.log" 2>&1
  else
    run_sql -f scripts/fixtures/whatsapp/audio.sql > "$task_pg_dir/audio.log" 2>&1
    run_sql -c "UPDATE agent_jobs SET lease_expires_at=NULL WHERE source_message_id=(SELECT id FROM whatsapp_messages WHERE external_message_id='another-conversation')"
    run_sql -f "$task_pg_dir/release.sql" > "$task_pg_dir/audio-recovery.log" 2>&1
    run_sql -f scripts/fixtures/whatsapp/audio-review.sql > "$task_pg_dir/audio-review.log" 2>&1
  fi
done
printf 'PASS: human control, two-session races, repeat/populated upgrade, module flags, recurring orders and audio.\nLogs: %s\n' "$task_pg_dir"
