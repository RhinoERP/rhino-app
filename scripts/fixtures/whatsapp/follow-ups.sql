\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_follow_up(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;

CREATE TEMP TABLE follow_up_fixture AS SELECT gen_random_uuid() org,gen_random_uuid() other_org,gen_random_uuid() actor,
  gen_random_uuid() wi,gen_random_uuid() other_wi,gen_random_uuid() list;
INSERT INTO organizations(id,whatsapp_enabled) SELECT org,true FROM follow_up_fixture UNION ALL SELECT other_org,true FROM follow_up_fixture;
INSERT INTO auth.users(id) SELECT actor FROM follow_up_fixture;
INSERT INTO organization_members(organization_id,user_id,is_owner) SELECT org,actor,true FROM follow_up_fixture;
INSERT INTO sales_price_lists(id,organization_id) SELECT list,org FROM follow_up_fixture;
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id)
  SELECT wi,org,'follow-up-fixture','ACTIVE',list,actor FROM follow_up_fixture;
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id) SELECT other_wi,other_org,'follow-up-other' FROM follow_up_fixture;

CREATE FUNCTION pg_temp.follow_up_turn(p_chat uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f follow_up_fixture%ROWTYPE; chat uuid:=coalesce(p_chat,gen_random_uuid()); message uuid; job agent_jobs; cmd jsonb; external text:=gen_random_uuid()::text;
BEGIN
  SELECT * INTO f FROM follow_up_fixture;
  IF p_chat IS NULL THEN
    INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone) VALUES(chat,f.org,f.wi,gen_random_uuid()::text);
  END IF;
  INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content,payload,created_at)
    VALUES(f.org,f.wi,chat,external,'INBOUND','¿Qué diferencia hay entre estos quesos?',jsonb_build_object('id',external,'timestamp',floor(extract(epoch FROM clock_timestamp()))::text),clock_timestamp())
    RETURNING id INTO message;
  INSERT INTO agent_jobs(organization_id,integration_id,conversation_id,source_message_id,job_type,execution_mode)
    VALUES(f.org,f.wi,chat,message,'PROCESS_CONVERSATION','DAEMON');
  SELECT * INTO job FROM claim_whatsapp_job_v2('follow-up-test','PROCESS_CONVERSATION','DAEMON',(SELECT id FROM agent_jobs WHERE source_message_id=message));
  IF job.id IS NULL THEN RAISE EXCEPTION 'Could not claim the ordinary turn'; END IF;
  cmd:=prepare_whatsapp_outbox(job.id,job.lease_token,'El cremoso es más suave. ¿Buscás algo para cocinar?',false);
  IF cmd->>'status'<>'SENDING' THEN RAISE EXCEPTION 'Could not reserve the ordinary reply: %',cmd; END IF;
  PERFORM complete_whatsapp_command((cmd->>'id')::uuid,job.lease_token,'SENT',gen_random_uuid()::text);
  UPDATE agent_jobs SET status='SUCCEEDED' WHERE id=job.id;
  RETURN chat;
END $$;

DO $$
DECLARE f follow_up_fixture%ROWTYPE; chat uuid; other_chat uuid; q whatsapp_follow_ups; claim jsonb; cmd jsonb; context jsonb;
  original_message uuid; deadline timestamptz; cart uuid; n integer;
BEGIN
  SELECT * INTO f FROM follow_up_fixture;
  PERFORM pg_temp.assert_follow_up(whatsapp_follow_up_protocol_version()=1,'Protocol and RPC privileges');
  PERFORM pg_temp.assert_follow_up(NOT has_table_privilege('authenticated','whatsapp_follow_ups','SELECT')
    AND NOT has_function_privilege('authenticated','claim_whatsapp_follow_up()','EXECUTE'),'No browser access');
  chat:=pg_temp.follow_up_turn();
  PERFORM pg_temp.assert_follow_up(NOT EXISTS(SELECT 1 FROM whatsapp_follow_ups),'Disabled by default');
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{enabled}','true') WHERE id=f.wi;
  PERFORM pg_temp.assert_follow_up(NOT EXISTS(SELECT 1 FROM whatsapp_follow_ups),'Enabling does not backfill old messages');
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  PERFORM pg_temp.assert_follow_up(q.id IS NOT NULL AND q.available_at BETWEEN clock_timestamp()+interval '29 minutes' AND clock_timestamp()+interval '31 minutes',
    'Product inquiry without cart schedules a single 30-minute evaluation');
  PERFORM pg_temp.assert_follow_up(claim_whatsapp_follow_up() IS NULL,'Cannot claim before the delay');
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{delayMinutes}','60') WHERE id=f.wi;
  PERFORM pg_temp.assert_follow_up((SELECT available_at FROM whatsapp_follow_ups WHERE id=q.id)=q.available_at,'Delay change preserves existing schedules');
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  PERFORM pg_temp.assert_follow_up((claim->>'id')::uuid=q.id AND claim_whatsapp_follow_up() IS NULL,'A lease has only one claimant');
  context:=read_whatsapp_follow_up_context(q.id,(claim->>'leaseToken')::uuid);
  PERFORM pg_temp.assert_follow_up(jsonb_array_length(context->'messages')=2 AND context->'commercialState'->>'hasPendingCart'='false','Read verified history without a cart');
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{instructions}','"Usá un tono breve"') WHERE id=f.wi;
  PERFORM pg_temp.assert_follow_up(read_whatsapp_follow_up_context(q.id,(claim->>'leaseToken')::uuid)->>'instructions'='Usá un tono breve','Instructions are read at execution');
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Te quedó alguna duda?','Consulta abierta','model',10,8,100);
  deadline:=guard_whatsapp_follow_up_dispatch((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'follow-up-fixture',(SELECT customer_phone FROM whatsapp_conversations WHERE id=chat));
  PERFORM pg_temp.assert_follow_up(deadline>clock_timestamp(),'Final dispatch is authorized inside the window');
  PERFORM pg_temp.assert_follow_up((SELECT count(*)=2 FROM whatsapp_outbox WHERE conversation_id=chat)
    AND (SELECT source_message_id IS NULL AND follow_up_id=q.id FROM whatsapp_outbox WHERE id=(cmd->>'id')::uuid),'Separate command identity from ordinary reply');
  PERFORM complete_whatsapp_command((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'SENT','follow-up-accepted');
  PERFORM pg_temp.assert_follow_up((SELECT status='SENT' AND model='model' AND input_tokens=10 FROM whatsapp_follow_ups WHERE id=q.id),'Accepted send is audited');
  PERFORM pg_temp.assert_follow_up((SELECT count(*)=1 FROM whatsapp_follow_ups WHERE conversation_id=chat),'Follow-up cannot schedule itself');
  PERFORM complete_whatsapp_command((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'SENT','follow-up-accepted');
  PERFORM pg_temp.assert_follow_up((SELECT count(*)=1 FROM whatsapp_messages WHERE external_message_id='follow-up-accepted'),'Completion is idempotent');
  PERFORM pg_temp.assert_follow_up((SELECT origin='AGENT' AND payload->>'followUpId'=q.id::text FROM whatsapp_messages WHERE external_message_id='follow-up-accepted'),'Timeline identifies follow-up as the bot');

  -- A new inbound cancels even an already generated command before HTTP.
  PERFORM pg_temp.follow_up_turn(chat);
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat AND status='PENDING';
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Seguimos?','Consulta abierta');
  INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content,created_at)
    VALUES(f.org,f.wi,chat,gen_random_uuid()::text,'INBOUND','Sí, quiero el cremoso',clock_timestamp());
  PERFORM pg_temp.assert_follow_up(guard_whatsapp_follow_up_dispatch((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'follow-up-fixture',
    (SELECT customer_phone FROM whatsapp_conversations WHERE id=chat)) IS NULL,'Inbound during generation/reservation blocks HTTP');
  PERFORM pg_temp.assert_follow_up((SELECT status='CANCELLED' FROM whatsapp_follow_ups WHERE id=q.id),'Inbound cancels pending follow-up');

  -- A late known acceptance must still be recorded after cancellation.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Seguimos?','Consulta abierta');
  UPDATE whatsapp_conversations SET status='PAUSED',control_version=control_version+1 WHERE id=chat;
  PERFORM pg_temp.assert_follow_up(complete_whatsapp_command((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'SENT','accepted-before-pause'),
    'Known acceptance survives a concurrent pause');
  PERFORM pg_temp.assert_follow_up((SELECT status='SENT' FROM whatsapp_follow_ups WHERE id=q.id),'Late acceptance is recorded, never resent');

  -- Turning the feature off cancels schedules and turning it on cannot revive them.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{enabled}','false') WHERE id=f.wi;
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{enabled}','true') WHERE id=f.wi;
  PERFORM pg_temp.assert_follow_up((SELECT status='CANCELLED' FROM whatsapp_follow_ups WHERE id=q.id),'Disable and re-enable never revives pending work');

  -- Expiration is measured from inbound evidence, not the outgoing timer.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp()-interval '25 hours' WHERE id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  cmd:=claim_whatsapp_follow_up();
  PERFORM pg_temp.assert_follow_up(cmd IS NULL AND (SELECT reason='WINDOW_EXPIRED' FROM whatsapp_follow_ups WHERE id=q.id),'Expired customer window is omitted');

  -- A lease lost while generating is safe to recover; a lost sending lease is not.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  UPDATE whatsapp_follow_ups SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=q.id;
  cmd:=claim_whatsapp_follow_up();
  PERFORM pg_temp.assert_follow_up(cmd->>'leaseToken'<>claim->>'leaseToken','Crash during generation obtains a fresh lease');
  PERFORM pg_temp.assert_follow_up(prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'Viejo','Viejo') IS NULL,'Expired lease cannot save or send output');
  claim:=cmd;
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Pudiste verlo?','Consulta abierta');
  -- Cancellation must not hide a potentially accepted send when its lease expires.
  UPDATE whatsapp_conversations SET status='PAUSED',control_version=control_version+1 WHERE id=chat;
  UPDATE whatsapp_outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(cmd->>'id')::uuid;
  PERFORM pg_temp.assert_follow_up(claim_whatsapp_follow_up() IS NULL,'Expired HTTP lease is not reclaimed');
  PERFORM pg_temp.assert_follow_up((SELECT status='UNKNOWN' FROM whatsapp_follow_ups WHERE id=q.id)
    AND (SELECT status='UNKNOWN' FROM whatsapp_outbox WHERE id=(cmd->>'id')::uuid),'Uncertain send stays reviewable even after pause');
  PERFORM pg_temp.assert_follow_up((get_whatsapp_inbox_detail(f.org,f.actor,chat)->'commands'->0->>'status')='UNKNOWN','Inbox exposes uncertain follow-up for review');
  PERFORM pg_temp.assert_follow_up((resolve_whatsapp_unknown(f.org,chat,(cmd->>'id')::uuid,f.actor,1,'CANCELLED','No fue enviado')->>'success')::boolean,
    'Existing review resolves a follow-up');
  PERFORM pg_temp.assert_follow_up((SELECT status='CANCELLED' FROM whatsapp_follow_ups WHERE id=q.id),'Review updates the durable queue');

  -- A confirmed provider rejection (429) can retry the SAME saved command/text.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'Texto persistido','Consulta abierta');
  PERFORM complete_whatsapp_command((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'PENDING');
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  context:=read_whatsapp_follow_up_context(q.id,(claim->>'leaseToken')::uuid);
  PERFORM pg_temp.assert_follow_up(context->>'storedText'='Texto persistido','Retry recovers saved text');
  context:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'Texto nuevo ignorado','STORED_RESPONSE');
  PERFORM pg_temp.assert_follow_up(context->>'id'=cmd->>'id' AND context->>'text'='Texto persistido','Retry preserves command identity and text');
  PERFORM complete_whatsapp_command((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'CANCELLED');

  -- A cart change after evaluation cannot be followed by stale output.
  chat:=pg_temp.follow_up_turn();
  INSERT INTO conversation_carts(id,organization_id,conversation_id) VALUES(gen_random_uuid(),f.org,chat);
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  cmd:=claim_whatsapp_follow_up();
  PERFORM pg_temp.assert_follow_up(cmd IS NULL AND (SELECT reason='COMMERCIAL_STATE_CHANGED' FROM whatsapp_follow_ups WHERE id=q.id),'Commercial changes invalidate a follow-up');

  -- A completed purchase on the source turn is excluded without blocking later inquiries.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  original_message:=q.source_message_id;
  INSERT INTO sales_orders(id,organization_id,conversation_id,source,created_at) VALUES(gen_random_uuid(),f.org,chat,'WHATSAPP',clock_timestamp()) RETURNING id INTO cart;
  UPDATE whatsapp_conversations SET current_pre_sale_id=cart WHERE id=chat;
  -- Simulate enqueue after the purchase was created, as in the actual commercial turn.
  UPDATE whatsapp_follow_ups SET status='PENDING',state_key=whatsapp_follow_up_state_key(chat),available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  cmd:=claim_whatsapp_follow_up();
  PERFORM pg_temp.assert_follow_up(cmd IS NULL AND (SELECT reason='PURCHASE_COMPLETED' FROM whatsapp_follow_ups WHERE id=q.id),'Purchase created by the source turn is excluded');

  -- Final guard also enforces business hours if the model crosses closing time.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Seguimos?','Consulta abierta');
  UPDATE whatsapp_integrations SET business_hours=jsonb_build_object('enabled',true,'timezone','UTC','weeklySchedule','{}'::jsonb) WHERE id=f.wi;
  PERFORM pg_temp.assert_follow_up(NOT whatsapp_follow_up_is_open(f.wi),'Closed business hours');
  PERFORM pg_temp.assert_follow_up(guard_whatsapp_follow_up_dispatch((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'follow-up-fixture',
    (SELECT customer_phone FROM whatsapp_conversations WHERE id=chat)) IS NULL,'Closing during generation blocks dispatch');
  PERFORM pg_temp.assert_follow_up((SELECT status='PENDING' AND reason='OUTSIDE_BUSINESS_HOURS' FROM whatsapp_follow_ups WHERE id=q.id),'Saved text is deferred after closing');
  UPDATE whatsapp_integrations SET business_hours=jsonb_build_object('enabled',false) WHERE id=f.wi;

  -- Deferred work keeps its attempt budget; invalid/skipped model output is terminal.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  PERFORM finish_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'DEFER','OUTSIDE_BUSINESS_HOURS',clock_timestamp()+interval '2 hours');
  PERFORM pg_temp.assert_follow_up((SELECT status='PENDING' AND attempts=0 FROM whatsapp_follow_ups WHERE id=q.id),'Deferring does not exhaust model attempts');
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  PERFORM finish_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'SKIP','Cliente se despidió',NULL,'model',10,5,100);
  PERFORM pg_temp.assert_follow_up((SELECT status='SKIPPED' AND decision->>'action'='SKIP' AND input_tokens=10 FROM whatsapp_follow_ups WHERE id=q.id),'Skipped decisions are audited and terminal');

  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  FOR n IN 1..5 LOOP
    UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
    claim:=claim_whatsapp_follow_up();
    PERFORM finish_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'RETRY','MODEL_TRANSIENT');
  END LOOP;
  PERFORM pg_temp.assert_follow_up((SELECT status='FAILED' AND attempts=5 FROM whatsapp_follow_ups WHERE id=q.id),'Transient failures have a bounded retry budget');

  -- A provider rejection that arrives after disable cannot resurrect the timer.
  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Seguimos?','Consulta abierta');
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{enabled}','false') WHERE id=f.wi;
  PERFORM complete_whatsapp_command((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'PENDING');
  UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{enabled}','true') WHERE id=f.wi;
  PERFORM pg_temp.assert_follow_up((SELECT status='CANCELLED' FROM whatsapp_follow_ups WHERE id=q.id)
    AND (SELECT status='CANCELLED' FROM whatsapp_outbox WHERE id=(cmd->>'id')::uuid),'Late 429 cannot revive cancelled work');

  chat:=pg_temp.follow_up_turn();
  SELECT * INTO q FROM whatsapp_follow_ups WHERE conversation_id=chat;
  UPDATE whatsapp_follow_ups SET available_at=clock_timestamp()-interval '1 minute' WHERE id=q.id;
  claim:=claim_whatsapp_follow_up();
  cmd:=prepare_whatsapp_follow_up(q.id,(claim->>'leaseToken')::uuid,'¿Seguimos?','Consulta abierta');
  UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp()-interval '25 hours' WHERE id=chat;
  PERFORM pg_temp.assert_follow_up(guard_whatsapp_follow_up_dispatch((cmd->>'id')::uuid,(claim->>'leaseToken')::uuid,'follow-up-fixture',
    (SELECT customer_phone FROM whatsapp_conversations WHERE id=chat)) IS NULL,'Window expiring during generation blocks HTTP');

  -- Cross-tenant anchors and outbox identities are rejected by compound FKs.
  INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone) VALUES(gen_random_uuid(),f.other_org,f.other_wi,'other') RETURNING id INTO other_chat;
  BEGIN
    UPDATE whatsapp_follow_ups SET organization_id=f.other_org,integration_id=f.other_wi,conversation_id=other_chat WHERE id=q.id;
    RAISE EXCEPTION 'Cross-tenant anchor was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE whatsapp_outbox SET organization_id=f.other_org,integration_id=f.other_wi,conversation_id=other_chat WHERE follow_up_id=q.id;
    RAISE EXCEPTION 'Cross-tenant command was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE whatsapp_integrations SET follow_up=jsonb_set(follow_up,'{delayMinutes}','0') WHERE id=f.wi;
    RAISE EXCEPTION 'Invalid delay was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'WhatsApp follow-up SQL checks passed';
ROLLBACK;
