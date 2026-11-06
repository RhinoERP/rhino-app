CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
-- A legitimate scheduling delay is not a failed processing attempt.
DO $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM agent_jobs WHERE id=(SELECT id FROM claimed_commercial);
  PERFORM finish_whatsapp_job_v2(j.id,j.lease_token,true,null,true,now()+interval '1 hour');
  IF EXISTS(SELECT 1 FROM agent_jobs WHERE id=j.id AND (attempts<>greatest(0,j.attempts-1) OR completed_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Scheduling consumed a retry or marked pending work completed';
  END IF;
END $$;
SELECT pg_temp.assert_true((SELECT status='RETRY' AND locked_by IS NULL FROM agent_jobs WHERE source_message_id=(SELECT id FROM whatsapp_messages WHERE external_message_id='another-conversation')),'Legacy crashed jobs are recoverable');
UPDATE agent_jobs SET status='CANCELLED',lease_expires_at=null WHERE status NOT IN ('SUCCEEDED','FAILED','CANCELLED');
CREATE SEQUENCE review_phone;
CREATE FUNCTION pg_temp.review_job(label text, kind text DEFAULT 'TEXT') RETURNS agent_jobs LANGUAGE plpgsql AS $$
DECLARE source_id uuid; j agent_jobs%ROWTYPE;
BEGIN
  SELECT message_id INTO source_id FROM ingest_whatsapp_inbound_message('123456','54911'||nextval('review_phone'),label,kind,'Quiero comprar queso','{"audio":{"id":"789"}}');
  SELECT * INTO j FROM claim_whatsapp_job_v2('review',CASE WHEN kind='AUDIO' THEN 'TRANSCRIBE_AUDIO' ELSE 'PROCESS_CONVERSATION' END,'DAEMON',
    (SELECT id FROM agent_jobs WHERE source_message_id=source_id AND job_type=CASE WHEN kind='AUDIO' THEN 'TRANSCRIBE_AUDIO' ELSE 'PROCESS_CONVERSATION' END));
  IF j.id IS NULL THEN RAISE EXCEPTION 'Fixture could not claim %',label; END IF;
  RETURN j;
END $$;

DO $$
DECLARE j agent_jobs%ROWTYPE; old_token uuid;
BEGIN
  j := pg_temp.review_job('review-stale-writer'); old_token:=j.lease_token;
  UPDATE agent_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=j.id;
  SELECT * INTO j FROM claim_whatsapp_job_v2('replacement','PROCESS_CONVERSATION','DAEMON',j.id);
  BEGIN
    PERFORM mutate_whatsapp_order_leased(j.id,old_token,j.organization_id,j.integration_id,j.conversation_id,j.source_message_id,'START');
    RAISE EXCEPTION 'STALE_WRITER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='STALE_WRITER_ACCEPTED' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM conversation_carts WHERE conversation_id=j.conversation_id) THEN RAISE EXCEPTION 'Stale worker created a cart'; END IF;
  PERFORM mutate_whatsapp_order_leased(j.id,j.lease_token,j.organization_id,j.integration_id,j.conversation_id,j.source_message_id,'START');
  IF NOT EXISTS(SELECT 1 FROM conversation_carts WHERE conversation_id=j.conversation_id) THEN RAISE EXCEPTION 'Current lease could not mutate'; END IF;
  PERFORM finish_whatsapp_job_v2(j.id,j.lease_token,true);
END $$;

DO $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  j:=pg_temp.review_job('review-real-time-expiry');
  UPDATE agent_jobs SET lease_expires_at=clock_timestamp()+interval '20 milliseconds' WHERE id=j.id;
  PERFORM pg_sleep(0.05);
  BEGIN
    PERFORM mutate_whatsapp_order_leased(j.id,j.lease_token,j.organization_id,j.integration_id,j.conversation_id,j.source_message_id,'START');
    RAISE EXCEPTION 'EXPIRED_WRITER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='EXPIRED_WRITER_ACCEPTED' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM conversation_carts WHERE conversation_id=j.conversation_id) THEN RAISE EXCEPTION 'Transaction-start time revived an expired lease'; END IF;
  UPDATE agent_jobs SET status='CANCELLED' WHERE id=j.id;
END $$;

DO $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  j:=pg_temp.review_job('review-retention','AUDIO');
  IF NOT validate_whatsapp_audio_asset(j.id,j.lease_token,'audio/mp4',100,2,'digest') THEN RAISE EXCEPTION 'Valid owner could not validate'; END IF;
  UPDATE whatsapp_audio_assets SET expires_at=now()-interval '1 second' WHERE message_id=j.source_message_id;
  IF expire_whatsapp_audio_asset(j.source_message_id) THEN RAISE EXCEPTION 'Cleanup raced a live worker'; END IF;
  UPDATE agent_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=j.id;
  IF NOT expire_whatsapp_audio_asset(j.source_message_id) THEN RAISE EXCEPTION 'Expired work did not terminate'; END IF;
  BEGIN
    PERFORM validate_whatsapp_audio_asset(j.id,j.lease_token,'audio/mp4',100,2,'digest');
    RAISE EXCEPTION 'EXPIRED_AUDIO_OWNER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='EXPIRED_AUDIO_OWNER_ACCEPTED' THEN RAISE; END IF; END;
  IF NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets WHERE message_id=j.source_message_id AND status='FAILED')
    OR NOT EXISTS(SELECT 1 FROM agent_jobs WHERE source_message_id=j.source_message_id AND job_type='PROCESS_CONVERSATION' AND status='PENDING') THEN RAISE EXCEPTION 'Expiration left the conversation blocked'; END IF;
END $$;

DO $$
DECLARE j agent_jobs%ROWTYPE; next_source uuid; next_job uuid; result jsonb; old_token uuid;
BEGIN
  j:=pg_temp.review_job('review-uncertain-delivery'); old_token:=j.lease_token;
  result:=prepare_whatsapp_outbox(j.id,j.lease_token,'Una respuesta');
  IF result->>'status'<>'SENDING' THEN RAISE EXCEPTION 'Could not prepare delivery'; END IF;
  SELECT message_id INTO next_source FROM ingest_whatsapp_inbound_message('123456',(SELECT customer_phone FROM whatsapp_conversations WHERE id=j.conversation_id),'review-newer-message','TEXT','Y otro queso','{}');
  SELECT id INTO next_job FROM agent_jobs WHERE source_message_id=next_source;
  UPDATE agent_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=j.id;
  IF EXISTS(SELECT 1 FROM claim_whatsapp_job_v2('too-early','PROCESS_CONVERSATION','DAEMON',next_job)) THEN RAISE EXCEPTION 'New work passed an uncertain earlier delivery'; END IF;
  SELECT * INTO j FROM claim_whatsapp_job_v2('recover-sending','PROCESS_CONVERSATION','DAEMON',j.id);
  IF j.id IS NULL THEN RAISE EXCEPTION 'Could not recover uncertain delivery'; END IF;
  BEGIN
    PERFORM recover_whatsapp_outbox(j.id,old_token);
    RAISE EXCEPTION 'STALE_DELIVERY_OWNER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='STALE_DELIVERY_OWNER_ACCEPTED' THEN RAISE; END IF; END;
  result:=recover_whatsapp_outbox(j.id,j.lease_token);
  IF result->>'status'<>'UNKNOWN' THEN RAISE EXCEPTION 'Recovery did not retain uncertainty'; END IF;
  PERFORM finish_whatsapp_job_v2(j.id,j.lease_token,false,'Review required',false);
  IF NOT EXISTS(SELECT 1 FROM whatsapp_outbox WHERE source_message_id=j.source_message_id AND status='UNKNOWN') THEN RAISE EXCEPTION 'Uncertain terminal delivery was forgotten'; END IF;
  IF EXISTS(SELECT 1 FROM claim_whatsapp_job_v2('still-blocked','PROCESS_CONVERSATION','DAEMON',next_job)) THEN RAISE EXCEPTION 'UNKNOWN did not block the conversation'; END IF;
END $$;

DO $$
DECLARE j agent_jobs%ROWTYPE; result jsonb;
BEGIN
  j:=pg_temp.review_job('review-manual-handoff');
  UPDATE whatsapp_conversations SET status='HANDOFF' WHERE id=j.conversation_id;
  result:=prepare_whatsapp_outbox(j.id,j.lease_token,'Cotización que ya no debe enviarse');
  IF result->>'status'<>'CANCELLED' THEN RAISE EXCEPTION 'A stale quote escaped a manual pause'; END IF;
  PERFORM finish_whatsapp_job_v2(j.id,j.lease_token,true);
END $$;

DO $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  j:=pg_temp.review_job('review-disabled-audio','AUDIO');
  UPDATE whatsapp_conversations SET pending_order_action='{"kind":"CONFIRM_PRE_SALE"}'::jsonb WHERE id=j.conversation_id;
  PERFORM finish_whatsapp_job_v2(j.id,j.lease_token,false,'Audio disabled',false);
  IF EXISTS(SELECT 1 FROM whatsapp_conversations WHERE id=j.conversation_id AND pending_order_action IS NOT NULL) THEN RAISE EXCEPTION 'A failed audio left an earlier confirmation valid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM whatsapp_audio_assets WHERE message_id=j.source_message_id AND status='FAILED')
    OR NOT EXISTS(SELECT 1 FROM agent_jobs WHERE source_message_id=j.source_message_id AND job_type='PROCESS_CONVERSATION' AND status='PENDING') THEN RAISE EXCEPTION 'Disabling audio blocked text'; END IF;
END $$;
-- A crash after saving a transcript must not invalidate a later valid quote.
DO $$
DECLARE j agent_jobs%ROWTYPE;
BEGIN
  j:=pg_temp.review_job('review-saved-before-finalize','AUDIO');
  PERFORM complete_whatsapp_transcription(j.id,j.lease_token,'Quiero comprar queso','test');
  UPDATE whatsapp_conversations SET pending_order_action='{"kind":"CONFIRM_PRE_SALE"}'::jsonb WHERE id=j.conversation_id;
  PERFORM finish_whatsapp_job_v2(j.id,j.lease_token,false,'Completion retry exhausted',false);
  IF EXISTS(SELECT 1 FROM whatsapp_conversations WHERE id=j.conversation_id AND pending_order_action IS NULL) THEN RAISE EXCEPTION 'A saved transcript invalidated a valid quote'; END IF;
END $$;
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.mutate_whatsapp_order_leased(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,integer,jsonb)','EXECUTE'),'Browser cannot invoke leased mutations');
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'claim_whatsapp_job_v2','mutate_whatsapp_order','prepare_whatsapp_outbox',
      'record_whatsapp_simulation_outbound','complete_whatsapp_audio_upload',
      'finish_whatsapp_agent_job','record_whatsapp_delivery_status','set_whatsapp_automation',
      'claim_whatsapp_agent_job','reserve_whatsapp_audio_usage','validate_whatsapp_audio_asset')
  LOOP
    IF has_function_privilege('anon',fn.oid,'EXECUTE') OR has_function_privilege('authenticated',fn.oid,'EXECUTE')
      OR NOT has_function_privilege('service_role',fn.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unsafe RPC permissions: %',fn.proname; END IF;
  END LOOP;
END $$;
SELECT 'Audio review regression checks passed';
CREATE FUNCTION pg_temp.assert_no_audio_rows(table_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE total bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I',table_name) INTO total;
  PERFORM pg_temp.assert_true(total=0,'No anonymous rows: '||table_name);
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SET ROLE anon;
SELECT pg_temp.assert_no_audio_rows('whatsapp_audio_uploads');
SELECT pg_temp.assert_no_audio_rows('whatsapp_audio_assets');
SELECT pg_temp.assert_no_audio_rows('whatsapp_outbox');
SELECT pg_temp.assert_no_audio_rows('whatsapp_audio_upload_daily_usage');
RESET ROLE;

DO $$
DECLARE wi uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); j agent_jobs%ROWTYPE; first_id uuid; second_id uuid;
BEGIN
  INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id)
  VALUES(wi,'11111111-1111-4111-8111-111111111111','rhinos-local-simulator:review','DRAFT','44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333');
  INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone,assigned_user_id)
  VALUES(c,'11111111-1111-4111-8111-111111111111',wi,'SIMULACIÓN LOCAL · review','33333333-3333-4333-8333-333333333333');
  INSERT INTO whatsapp_messages(id,organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content)
  VALUES(src,'11111111-1111-4111-8111-111111111111',wi,c,'review-inline-source','INBOUND','TEXT','Hola');
  SELECT * INTO j FROM claim_whatsapp_job_v2('inline-review','PROCESS_CONVERSATION','INLINE',(SELECT id FROM agent_jobs WHERE source_message_id=src));
  first_id:=record_whatsapp_simulation_outbound(j.id,j.lease_token,'Hola',false);
  second_id:=record_whatsapp_simulation_outbound(j.id,j.lease_token,'No debe duplicarse',false);
  IF first_id IS DISTINCT FROM second_id OR (SELECT count(*) FROM whatsapp_messages WHERE conversation_id=c AND direction='OUTBOUND')<>1 THEN RAISE EXCEPTION 'Inline retry duplicated the response'; END IF;
  UPDATE agent_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=j.id;
  BEGIN
    PERFORM record_whatsapp_simulation_outbound(j.id,j.lease_token,'No debe guardarse',false);
    RAISE EXCEPTION 'STALE_INLINE_RESPONSE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='STALE_INLINE_RESPONSE_ACCEPTED' THEN RAISE; END IF; END;
  UPDATE agent_jobs SET status='CANCELLED' WHERE id=j.id;
END $$;
SELECT pg_temp.assert_true(whatsapp_worker_protocol_version()=2,'Worker protocol is ready only after the migration');
GRANT EXECUTE ON FUNCTION claim_whatsapp_job_v2(text,text,text,uuid,integer) TO anon;
SELECT pg_temp.assert_true(whatsapp_worker_protocol_version()=0,'Unsafe grants keep the worker unready');
REVOKE EXECUTE ON FUNCTION claim_whatsapp_job_v2(text,text,text,uuid,integer) FROM anon;


-- Deleting expired reservations cannot reset the admission counter.
DO $$
DECLARE c whatsapp_conversations%ROWTYPE; n integer; first_id uuid;
BEGIN
  SELECT * INTO c FROM whatsapp_conversations WHERE customer_phone='54911'||currval('review_phone');
  FOR n IN 1..100 LOOP
    INSERT INTO whatsapp_audio_uploads(id,organization_id,integration_id,conversation_id,actor_id,storage_path,mime_type,declared_bytes)
    VALUES(gen_random_uuid(),c.organization_id,c.integration_id,c.id,'33333333-3333-4333-8333-333333333333','quota-test/'||n,'audio/mp4',100);
  END LOOP;
  SELECT id INTO first_id FROM whatsapp_audio_uploads WHERE storage_path='quota-test/1';
  INSERT INTO whatsapp_audio_uploads SELECT * FROM whatsapp_audio_uploads WHERE id=first_id ON CONFLICT DO NOTHING;
  DELETE FROM whatsapp_audio_uploads WHERE storage_path='quota-test/2';
  BEGIN
    INSERT INTO whatsapp_audio_uploads(id,organization_id,integration_id,conversation_id,actor_id,storage_path,mime_type,declared_bytes)
    VALUES(gen_random_uuid(),c.organization_id,c.integration_id,c.id,'33333333-3333-4333-8333-333333333333','quota-test/overflow','audio/mp4',100);
    RAISE EXCEPTION 'UPLOAD_QUOTA_RESET_BY_CLEANUP';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
END $$;
-- Four independent consumers, two organizations, with a queued second message
-- in one conversation: no two consumers may own that conversation together.
UPDATE agent_jobs SET status='CANCELLED',lease_expires_at=null WHERE status NOT IN ('SUCCEEDED','FAILED','CANCELLED');
-- More than one claim page of blocked work must not starve other chats.
SELECT * FROM ingest_whatsapp_inbound_message('123456','549110000999','review-queue-blocker','AUDIO',null,'{"audio":{"id":"999"}}');
UPDATE whatsapp_messages SET created_at=now()-interval '1 hour' WHERE external_message_id='review-queue-blocker';
SELECT result.* FROM generate_series(1,60) AS n
CROSS JOIN LATERAL ingest_whatsapp_inbound_message('123456','549110000999','review-blocked-'||n,'TEXT','Mensaje pendiente','{}') AS result;
INSERT INTO organizations(id,whatsapp_enabled) VALUES('99999999-9999-4999-8999-999999999999',true);
INSERT INTO organization_members(user_id,organization_id) VALUES('33333333-3333-4333-8333-333333333333','99999999-9999-4999-8999-999999999999');
INSERT INTO sales_price_lists(id,organization_id) VALUES('99999999-9999-4999-8999-999999999998','99999999-9999-4999-8999-999999999999');
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id)
VALUES('99999999-9999-4999-8999-999999999997','99999999-9999-4999-8999-999999999999','123457','ACTIVE','99999999-9999-4999-8999-999999999998','33333333-3333-4333-8333-333333333333');
SELECT * FROM ingest_whatsapp_inbound_message('123456','549112222001','review-parallel-1','TEXT','Uno','{}');
SELECT * FROM ingest_whatsapp_inbound_message('123456','549112222001','review-parallel-followup','TEXT','Otro','{}');
SELECT * FROM ingest_whatsapp_inbound_message('123456','549112222002','review-parallel-2','TEXT','Dos','{}');
SELECT * FROM ingest_whatsapp_inbound_message('123457','549112222003','review-parallel-3','TEXT','Tres','{}');
SELECT * FROM ingest_whatsapp_inbound_message('123457','549112222004','review-parallel-4','TEXT','Cuatro','{}');
