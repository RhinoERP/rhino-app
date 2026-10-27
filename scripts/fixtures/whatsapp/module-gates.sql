GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END; $$;
INSERT INTO organizations(id) VALUES ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
SELECT pg_temp.assert_true((SELECT bool_and(NOT whatsapp_enabled AND NOT whatsapp_sandbox_enabled) FROM organizations), 'Both flags default false');
INSERT INTO auth.users(id) VALUES ('33333333-3333-4333-8333-333333333333');
INSERT INTO organization_members(user_id,organization_id) VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');
INSERT INTO sales_price_lists(id,organization_id) VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111');
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id) VALUES
('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','123456','ACTIVE','44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333'),
('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','rhinos-local-simulator:test','DRAFT',NULL,NULL);
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone) VALUES
('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666','SIMULACIÓN LOCAL · test');
INSERT INTO conversation_carts(id,organization_id,conversation_id) VALUES ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777');
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM ingest_whatsapp_inbound_message('123456','5491100000000','disabled','TEXT','Hola','{}')), 'Disabled webhook persists no messages');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM whatsapp_integrations), 'RLS hides integrations by default');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM whatsapp_conversations), 'RLS hides conversations by default');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM conversation_carts), 'RLS hides carts by default');
DO $$ BEGIN
  BEGIN
    UPDATE organizations SET whatsapp_enabled=true;
    RAISE EXCEPTION 'FAIL: tenant enabled WhatsApp';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE organizations SET whatsapp_sandbox_enabled=true;
    RAISE EXCEPTION 'FAIL: tenant enabled sandbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE organizations SET whatsapp_sandbox_enabled=true WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM whatsapp_integrations WHERE phone_number_id LIKE 'rhinos-local-simulator:%'), 'Sandbox visible independently');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM whatsapp_integrations WHERE phone_number_id='123456'), 'Live channel stays hidden');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM conversation_carts), 'Sandbox carts visible through RLS');
DO $$ BEGIN
  BEGIN
    UPDATE whatsapp_integrations SET status='ACTIVE',sales_price_list_id='44444444-4444-4444-8444-444444444444',responsible_user_id='33333333-3333-4333-8333-333333333333' WHERE phone_number_id LIKE 'rhinos-local-simulator:%';
    RAISE EXCEPTION 'FAIL: sandbox integration activated';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE organizations SET whatsapp_enabled=true,whatsapp_sandbox_enabled=false WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM whatsapp_integrations), 'Live visible, sandbox hidden');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM conversation_carts), 'Disabled sandbox carts hidden again');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM ingest_whatsapp_inbound_message('123456','5491100000000','enabled','TEXT','Hola','{}')), 'Enabled webhook ingests a message and a job');
SELECT pg_temp.assert_true((SELECT inserted=false FROM ingest_whatsapp_inbound_message('123456','5491100000000','enabled','TEXT','Hola','{}')), 'Duplicate webhook is idempotent');
RESET ROLE;
UPDATE organizations SET whatsapp_enabled=false;
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM claim_whatsapp_agent_job('test-worker')), 'Disabled tenant jobs cannot be claimed');
RESET ROLE;
UPDATE organizations SET whatsapp_enabled=true WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM claim_whatsapp_agent_job('test-worker')), 'Enabled tenant job is claimed');
SELECT defer_whatsapp_agent_job(id,'test-worker',now()+interval '1 minute') FROM agent_jobs WHERE status='PROCESSING';
SELECT pg_temp.assert_true((SELECT human_delay_applied AND attempts=0 AND status='RETRY' AND locked_by IS NULL FROM agent_jobs LIMIT 1), 'Deferral is durable and does not consume a retry');
RESET ROLE;
UPDATE organizations SET is_active=false WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM whatsapp_integrations), 'Inactive organization hidden');
RESET ROLE;
SELECT 'WhatsApp database rollout checks passed' AS result;
