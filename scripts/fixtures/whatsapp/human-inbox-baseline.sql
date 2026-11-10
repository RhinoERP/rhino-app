-- Phase 0 diagnostic of the current schema, including known gaps, not acceptance
-- tests for the future inbox. Run only after bootstrap + the WhatsApp SQL bundle
-- in a disposable database. All fixture data and grants are rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END $$;

GRANT USAGE ON SCHEMA public, auth TO authenticated;
INSERT INTO organizations(id,whatsapp_enabled) VALUES
  ('10000000-0000-4000-8000-000000000001',true),
  ('10000000-0000-4000-8000-000000000002',true);
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004');
INSERT INTO organization_members(organization_id,user_id) VALUES
  ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004');
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id) VALUES
  ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','baseline-inbox-one'),
  ('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','baseline-inbox-two');
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone) VALUES
  ('10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','5491100000001'),
  ('10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','5491100000002');
INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content,payload) VALUES
  ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000007','baseline-inbox-outbound','OUTBOUND','Texto de prueba','{"internal_marker":"baseline-only"}');

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM whatsapp_conversations WHERE id='10000000-0000-4000-8000-000000000007'), 'Membership grants own-tenant read');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM whatsapp_conversations WHERE id='10000000-0000-4000-8000-000000000008'), 'Other tenant hidden');
SELECT pg_temp.assert_true((SELECT payload->>'internal_marker'='baseline-only' FROM whatsapp_messages WHERE external_message_id='baseline-inbox-outbound'), 'GAP: direct member read includes raw payload');
UPDATE whatsapp_conversations SET status='HANDOFF',assigned_user_id='10000000-0000-4000-8000-000000000004'
WHERE id='10000000-0000-4000-8000-000000000007';
SELECT pg_temp.assert_true((SELECT status='HANDOFF' AND assigned_user_id='10000000-0000-4000-8000-000000000004' FROM whatsapp_conversations WHERE id='10000000-0000-4000-8000-000000000007'), 'GAP: member can change control and assign a non-member directly');
WITH changed AS (
  UPDATE whatsapp_conversations SET status='PAUSED' WHERE id='10000000-0000-4000-8000-000000000008' RETURNING id
) SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed), 'Other tenant update blocked');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM whatsapp_outbox), 'Outbox hidden from member');
RESET ROLE;

DO $$ DECLARE fn record; checked integer:=0; BEGIN
  FOR fn IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'ingest_whatsapp_inbound_message','claim_whatsapp_agent_job',
      'finish_whatsapp_agent_job','defer_whatsapp_agent_job',
      'record_whatsapp_delivery_status','record_whatsapp_outbound_message',
      'mutate_whatsapp_order','set_whatsapp_automation',
      'complete_whatsapp_audio_upload','claim_whatsapp_job_v2',
      'renew_whatsapp_job_lease','finish_whatsapp_job_v2',
      'reserve_whatsapp_audio_usage','complete_whatsapp_transcription',
      'assert_whatsapp_job_lease','assert_whatsapp_audio_job',
      'prepare_whatsapp_outbox','complete_whatsapp_outbox',
      'recover_whatsapp_outbox','whatsapp_worker_protocol_version',
      'lock_whatsapp_job_lease','mutate_whatsapp_order_leased',
      'validate_whatsapp_audio_asset','expire_whatsapp_audio_asset',
      'record_whatsapp_simulation_outbound','whatsapp_product_recommendations'
    )
  LOOP
    checked:=checked+1;
    PERFORM pg_temp.assert_true(NOT has_function_privilege('anon',fn.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',fn.oid,'EXECUTE')
      AND has_function_privilege('service_role',fn.oid,'EXECUTE'), 'Server RPC restricted: '||fn.proname);
  END LOOP;
  PERFORM pg_temp.assert_true(checked=26, 'All 26 server RPCs inspected');
END $$;
SELECT pg_temp.assert_true(whatsapp_worker_protocol_version()=2, 'Current worker protocol is 2 despite direct-table gaps');
SELECT pg_temp.assert_true(EXISTS(
  SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid
  WHERE c.conrelid='whatsapp_outbox'::regclass AND c.contype='p'
    AND a.attname='source_message_id' AND c.conkey=ARRAY[a.attnum]
), 'Outbox primary key is source_message_id');
SELECT pg_temp.assert_true(NOT EXISTS(
  SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='whatsapp_outbox'::regclass
), 'No foreign keys reference the outbox primary key');

SELECT record_whatsapp_delivery_status('baseline-inbox-outbound','READ');
SELECT record_whatsapp_delivery_status('baseline-inbox-outbound','DELIVERED');
SELECT pg_temp.assert_true((SELECT delivery_status='DELIVERED' FROM whatsapp_messages WHERE external_message_id='baseline-inbox-outbound'), 'GAP: DELIVERED currently downgrades READ');
SELECT pg_temp.assert_true(NOT record_whatsapp_delivery_status('baseline-inbox-early','READ'), 'GAP: early callback currently has no matching record');
SELECT 'WhatsApp human inbox baseline: isolation/RPC checks passed; known direct-access and delivery gaps reproduced';
ROLLBACK;
