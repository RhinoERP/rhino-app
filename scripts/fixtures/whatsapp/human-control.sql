-- Acceptance checks for bootstrap + the complete release, in a disposable DB.
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE TABLE whatsapp_control_fixture AS SELECT
  gen_random_uuid() org, gen_random_uuid() foreign_org,
  gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() reader,
  gen_random_uuid() stranger, gen_random_uuid() inactive, gen_random_uuid() no_permission,
  gen_random_uuid() org_admin, gen_random_uuid() owner, gen_random_uuid() wrong_role,
  gen_random_uuid() manage_role, gen_random_uuid() read_role, gen_random_uuid() admin_role,
  gen_random_uuid() foreign_role, gen_random_uuid() wi, gen_random_uuid() sim_wi,
  gen_random_uuid() c, gen_random_uuid() sim_c, gen_random_uuid() race_c, gen_random_uuid() sending_race_c,
  gen_random_uuid() price_list;
INSERT INTO organizations(id,whatsapp_enabled,whatsapp_sandbox_enabled)
  SELECT org,true,true FROM whatsapp_control_fixture UNION ALL SELECT foreign_org,true,true FROM whatsapp_control_fixture;
INSERT INTO auth.users(id) SELECT unnest(ARRAY[a,b,reader,stranger,inactive,no_permission,org_admin,owner,wrong_role]) FROM whatsapp_control_fixture;
INSERT INTO roles(id,organization_id) SELECT manage_role,org FROM whatsapp_control_fixture
  UNION ALL SELECT read_role,org FROM whatsapp_control_fixture UNION ALL SELECT admin_role,org FROM whatsapp_control_fixture
  UNION ALL SELECT foreign_role,foreign_org FROM whatsapp_control_fixture;
INSERT INTO permissions(key) VALUES('whatsapp.manage'),('whatsapp.read'),('organization.admin') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT role, p.id FROM whatsapp_control_fixture f
  CROSS JOIN LATERAL (VALUES(f.manage_role,'whatsapp.manage'),(f.read_role,'whatsapp.read'),(f.admin_role,'organization.admin'),(f.foreign_role,'whatsapp.manage')) v(role,key)
  JOIN permissions p ON p.key=v.key;
INSERT INTO organization_members(user_id,organization_id,role_id,is_active,is_owner)
  SELECT u,org,role,active,is_owner FROM whatsapp_control_fixture f
  CROSS JOIN LATERAL (VALUES(a,manage_role,true,false),(b,manage_role,true,false),(reader,read_role,true,false),
    (inactive,manage_role,false,false),(no_permission,NULL::uuid,true,false),(org_admin,admin_role,true,false),
    (owner,NULL::uuid,true,true),(wrong_role,foreign_role,true,false)) v(u,role,active,is_owner);
INSERT INTO organization_members(user_id,organization_id,role_id) SELECT stranger,foreign_org,foreign_role FROM whatsapp_control_fixture;
INSERT INTO sales_price_lists(id,organization_id) SELECT price_list,org FROM whatsapp_control_fixture;
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id)
  SELECT wi,org,'control-test-phone','ACTIVE',price_list,a FROM whatsapp_control_fixture
  UNION ALL SELECT sim_wi,org,'rhinos-local-simulator:control-test','DRAFT',price_list,a FROM whatsapp_control_fixture;
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone)
  SELECT chat,org,wi,phone FROM whatsapp_control_fixture f CROSS JOIN LATERAL
    (VALUES(c,'5491100000101'),(race_c,'5491100000102'),(sending_race_c,'5491100000103')) v(chat,phone);
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone)
  SELECT sim_c,org,sim_wi,'SIMULACIÓN LOCAL · control-test' FROM whatsapp_control_fixture;

-- Grants/policies/RPCs: no browser route to payloads or control, including readers.
DO $$ DECLARE t record; fn record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND (tablename LIKE 'whatsapp\_%' ESCAPE '\' AND tablename<>'whatsapp_control_fixture'
      OR tablename IN ('conversation_carts','conversation_cart_items','agent_jobs','agent_runs')) LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege('authenticated','public.'||t.tablename,'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('anon','public.'||t.tablename,'SELECT,INSERT,UPDATE,DELETE'), 'No direct grants: '||t.tablename);
    PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t.tablename),'No bypass policies: '||t.tablename);
  END LOOP;
  FOR fn IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('control_whatsapp_conversation','set_whatsapp_automation',
      'handoff_whatsapp_conversation','whatsapp_actor_can_manage','whatsapp_conversation_control_state','list_whatsapp_control_operators',
      'mutate_whatsapp_order_leased','prepare_whatsapp_outbox','record_whatsapp_simulation_outbound') LOOP
    PERFORM pg_temp.assert_true(NOT has_function_privilege('anon',fn.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',fn.oid,'EXECUTE')
      AND has_function_privilege('service_role',fn.oid,'EXECUTE'),'Server-only RPC: '||fn.proname);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
DO $$ DECLARE f whatsapp_control_fixture%ROWTYPE; BEGIN
  SELECT * INTO f FROM whatsapp_control_fixture;
  PERFORM set_config('request.jwt.claim.sub',f.reader::text,false);
  PERFORM set_config('request.jwt.claim.role','authenticated',false);
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM * FROM whatsapp_conversations; RAISE EXCEPTION 'DIRECT_READ_ACCEPTED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE whatsapp_conversations SET status='HANDOFF'; RAISE EXCEPTION 'DIRECT_WRITE_ACCEPTED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM control_whatsapp_conversation(NULL,NULL,NULL,0,'CLAIM'); RAISE EXCEPTION 'DIRECT_RPC_ACCEPTED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM set_whatsapp_automation(NULL,NULL,true,NULL); RAISE EXCEPTION 'LEGACY_RPC_ACCEPTED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$ DECLARE f whatsapp_control_fixture%ROWTYPE; actor uuid; result jsonb; src uuid; job agent_jobs%ROWTYPE; cart uuid:=gen_random_uuid();
  old_claim timestamptz; old_version integer; BEGIN
  SELECT * INTO f FROM whatsapp_control_fixture;
  FOR actor IN SELECT unnest(ARRAY[f.reader,f.stranger,f.inactive,f.no_permission,f.wrong_role]) LOOP
    BEGIN PERFORM control_whatsapp_conversation(f.org,f.c,actor,0,'CLAIM'); RAISE EXCEPTION 'UNAUTHORIZED_CLAIM';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM set_whatsapp_automation(f.org,f.c,false,actor); RAISE EXCEPTION 'UNAUTHORIZED_LEGACY_PAUSE';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN PERFORM control_whatsapp_conversation(f.foreign_org,f.c,f.stranger,0,'CLAIM'); RAISE EXCEPTION 'CROSS_TENANT_CONTROL';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM set_whatsapp_automation(f.org,f.c,true,f.a); RAISE EXCEPTION 'VERSIONLESS_CONTROL_ACCEPTED';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE organizations SET whatsapp_enabled=false WHERE id=f.org;
  BEGIN PERFORM control_whatsapp_conversation(f.org,f.c,f.a,0,'CLAIM'); RAISE EXCEPTION 'DISABLED_CONTROL';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Sandbox is independently enabled; pause/return use its own flag, never Meta.
  PERFORM control_whatsapp_conversation(f.org,f.sim_c,f.a,0,'CLAIM');
  PERFORM control_whatsapp_conversation(f.org,f.sim_c,f.a,1,'RESUME');
  UPDATE organizations SET whatsapp_enabled=true,whatsapp_sandbox_enabled=false WHERE id=f.org;
  BEGIN PERFORM control_whatsapp_conversation(f.org,f.sim_c,f.a,2,'CLAIM'); RAISE EXCEPTION 'DISABLED_SANDBOX_CONTROL';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE organizations SET whatsapp_sandbox_enabled=true WHERE id=f.org;
  UPDATE organizations SET is_active=false WHERE id=f.org;
  BEGIN PERFORM control_whatsapp_conversation(f.org,f.c,f.a,0,'CLAIM'); RAISE EXCEPTION 'INACTIVE_ORG_CONTROL';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE organizations SET is_active=true WHERE id=f.org;

  SELECT message_id INTO src FROM ingest_whatsapp_inbound_message('control-test-phone','5491100000101','control-source','TEXT','Quiero hablar con alguien',jsonb_build_object('id','control-source','timestamp',floor(extract(epoch FROM clock_timestamp()))::text));
  SELECT * INTO job FROM claim_whatsapp_job_v2('control-tests','PROCESS_CONVERSATION','DAEMON',(SELECT id FROM agent_jobs WHERE source_message_id=src));
  INSERT INTO conversation_carts(id,organization_id,conversation_id,status) VALUES(cart,f.org,f.c,'OPEN');
  UPDATE whatsapp_conversations SET pending_order_action='{"kind":"CONFIRM_PRE_SALE"}' WHERE id=f.c;
  result:=mutate_whatsapp_order_leased(job.id,job.lease_token,f.org,f.wi,f.c,src,'HANDOFF',NULL,NULL,'{"reason":"Pidió una persona"}');
  PERFORM pg_temp.assert_true((SELECT status='HANDOFF' AND assigned_user_id=f.a AND human_claimed_at IS NULL AND control_version=1 AND pending_order_action IS NULL FROM whatsapp_conversations WHERE id=f.c),'Handoff assigns but does not accept');
  PERFORM handoff_whatsapp_conversation(f.org,f.wi,f.c,src,'Retry');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM whatsapp_conversation_events WHERE conversation_id=f.c),'Handoff source retry creates one episode');
  -- Only that episode may reserve its one notice. Ordinary prompts are refused.
  result:=prepare_whatsapp_outbox(job.id,job.lease_token,'Aviso de derivación',false);
  PERFORM pg_temp.assert_true(result->>'status'='SENDING','Episode notice can reserve');
  PERFORM pg_temp.assert_true(result->>'text'='Una persona del equipo comercial va a continuar la atención por este chat.','Handoff notice uses server-controlled text, not generated commercial text');
  PERFORM pg_temp.assert_true(complete_whatsapp_outbox(src,job.lease_token,'PENDING'),'Explicit rejection may return pending');
  result:=control_whatsapp_conversation(f.org,f.c,f.b,1,'CLAIM');
  PERFORM pg_temp.assert_true((result->>'success')::boolean AND result->'control'->>'assignedUserId'=f.b::text,'Assignment is not acceptance: another operator can claim');
  SELECT human_claimed_at INTO old_claim FROM whatsapp_conversations WHERE id=f.c;
  PERFORM pg_temp.assert_true((SELECT status='CANCELLED' FROM whatsapp_outbox WHERE source_message_id=src),'Claim cancels pending automatic command');
  PERFORM pg_temp.assert_true(NOT assert_whatsapp_job_lease(job.id,job.lease_token,f.c,src),'Claim fences running model/tools');
  result:=control_whatsapp_conversation(f.org,f.c,f.a,2,'CLAIM');
  PERFORM pg_temp.assert_true(result->>'code'='CONFLICT','Cannot steal an accepted chat even with current version');
  FOR actor IN SELECT unnest(ARRAY[f.reader,f.stranger,f.inactive,f.no_permission,f.wrong_role]) LOOP
    BEGIN PERFORM control_whatsapp_conversation(f.org,f.c,f.b,2,'TRANSFER',actor); RAISE EXCEPTION 'INVALID_RECIPIENT';
      EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  PERFORM control_whatsapp_conversation(f.org,f.c,f.org_admin,2,'TRANSFER',f.a);
  PERFORM pg_temp.assert_true((SELECT assigned_user_id=f.a AND human_claimed_at=old_claim AND control_version=3 FROM whatsapp_conversations WHERE id=f.c),'Admin may transfer and keeps acceptance');
  UPDATE whatsapp_conversations SET pending_order_action='{"kind":"CONFIRM_PRE_SALE"}' WHERE id=f.c;
  PERFORM control_whatsapp_conversation(f.org,f.c,f.owner,3,'RESUME');
  PERFORM pg_temp.assert_true((SELECT status='ACTIVE' AND human_claimed_at IS NULL AND assigned_user_id IS NULL AND automation_resumed_at IS NOT NULL AND pending_order_action IS NULL FROM whatsapp_conversations WHERE id=f.c),'Return releases acceptance and invalidates old confirmation');
  PERFORM pg_temp.assert_true((SELECT status='OPEN' FROM conversation_carts WHERE id=cart),'Return preserves pending order');
  result:=prepare_whatsapp_outbox(job.id,job.lease_token,'Vieja cotización',true);
  PERFORM pg_temp.assert_true(result->>'status'='CANCELLED','Source from before return cannot send');
  UPDATE agent_jobs SET status='PENDING',lease_expires_at=NULL WHERE id=job.id;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM claim_whatsapp_job_v2('old-source','PROCESS_CONVERSATION','DAEMON',job.id)),'Old source cannot be claimed after return');
  UPDATE agent_jobs SET status='CANCELLED' WHERE id=job.id;

  -- Fresh source may run, then a claim while SENDING keeps the result unresolved.
  INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,created_at,payload)
    VALUES(f.org,f.wi,f.c,'control-fresh-source','INBOUND','TEXT','Hola de nuevo',clock_timestamp(),jsonb_build_object('id','control-fresh-source','timestamp',floor(extract(epoch FROM clock_timestamp()))::text)) RETURNING id INTO src;
  INSERT INTO agent_jobs(organization_id,integration_id,conversation_id,source_message_id,job_type,execution_mode)
    VALUES(f.org,f.wi,f.c,src,'PROCESS_CONVERSATION','DAEMON') ON CONFLICT DO NOTHING;
  SELECT * INTO job FROM claim_whatsapp_job_v2('fresh-source','PROCESS_CONVERSATION','DAEMON',(SELECT id FROM agent_jobs WHERE source_message_id=src));
  PERFORM pg_temp.assert_true(job.id IS NOT NULL,'New customer message can run after return');
  result:=prepare_whatsapp_outbox(job.id,job.lease_token,'Respuesta en curso',false);
  PERFORM pg_temp.assert_true(result->>'status'='SENDING','Fresh source reserves');
  result:=control_whatsapp_conversation(f.org,f.c,f.a,4,'CLAIM');
  PERFORM pg_temp.assert_true(result->'control'->>'deliveryBlock'='SENDING','Claim surfaces already reserved send');
  result:=control_whatsapp_conversation(f.org,f.c,f.a,5,'RESUME');
  PERFORM pg_temp.assert_true(result->>'code'='DELIVERY_UNRESOLVED','Return blocks SENDING');
  PERFORM complete_whatsapp_outbox(src,job.lease_token,'UNKNOWN');
  result:=control_whatsapp_conversation(f.org,f.c,f.a,5,'RESUME');
  PERFORM pg_temp.assert_true(result->>'code'='DELIVERY_UNRESOLVED' AND result->'control'->>'deliveryBlock'='UNKNOWN','Return blocks UNKNOWN');
  PERFORM pg_temp.assert_true(complete_whatsapp_outbox(src,job.lease_token,'SENT','control-known-accepted'),'Known result may finish after human claim');
  PERFORM control_whatsapp_conversation(f.org,f.c,f.a,5,'RESUME');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM whatsapp_messages WHERE external_message_id='control-known-accepted'),'Late provider acceptance recorded once');

  -- Pause clears acceptance and old confirmations, not orders; CLOSED stays closed.
  PERFORM control_whatsapp_conversation(f.org,f.c,f.a,6,'PAUSE');
  PERFORM pg_temp.assert_true((SELECT status='PAUSED' AND human_claimed_at IS NULL AND control_version=7 FROM whatsapp_conversations WHERE id=f.c),'Pause is versioned');
  SELECT control_version INTO old_version FROM whatsapp_conversations WHERE id=f.c;
  PERFORM control_whatsapp_conversation(f.org,f.c,f.a,old_version,'PAUSE');
  PERFORM pg_temp.assert_true((SELECT control_version=old_version FROM whatsapp_conversations WHERE id=f.c),'Repeated pause creates no event');
  PERFORM control_whatsapp_conversation(f.org,f.c,f.a,7,'CLAIM');
  PERFORM pg_temp.assert_true((SELECT count(*)=c.control_version FROM whatsapp_conversation_events e JOIN whatsapp_conversations c ON c.id=e.conversation_id WHERE c.id=f.c GROUP BY c.control_version),'One audit event per transition');
  UPDATE whatsapp_conversations SET status='CLOSED',human_claimed_at=NULL WHERE id=f.c;
  BEGIN PERFORM control_whatsapp_conversation(f.org,f.c,f.a,8,'CLAIM'); RAISE EXCEPTION 'CLOSED_REOPENED';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
UPDATE agent_jobs SET status='SUCCEEDED' WHERE organization_id=(SELECT org FROM whatsapp_control_fixture);
SELECT 'Human control: RBAC, tenant/flags, acceptance, transfer, resume, audit and outbox fences passed';
