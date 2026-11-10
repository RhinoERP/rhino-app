CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
-- Run after human-control.sql, on its disposable tenant/RBAC fixture only.
CREATE TABLE whatsapp_human_fixture AS SELECT org,a,b,reader,stranger,wi,sim_wi,foreign_org,
  gen_random_uuid() chat,gen_random_uuid() other_chat,gen_random_uuid() request_id,
  gen_random_uuid() race_chat,gen_random_uuid() race_request FROM whatsapp_control_fixture;
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone)
  SELECT chat_id,org,wi,phone FROM whatsapp_human_fixture f CROSS JOIN LATERAL
    (VALUES(chat,'5491100000201'),(other_chat,'5491100000202'),(race_chat,'5491100000203')) c(chat_id,phone);

-- Effective privileges, including helpers installed under Supabase default grants.
DO $$ DECLARE fn record; BEGIN
  FOR fn IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('enqueue_whatsapp_human_message','claim_whatsapp_human_outbox','complete_whatsapp_command',
      'reserve_whatsapp_human_dispatch','guard_whatsapp_human_dispatch','whatsapp_guarded_dispatch_ready',
      'resolve_whatsapp_unknown','whatsapp_command_dto','record_whatsapp_delivery_status_scoped','reconcile_whatsapp_delivery') LOOP
    PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated',fn.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',fn.oid,'EXECUTE') AND has_function_privilege('service_role',fn.oid,'EXECUTE'),'Server-only function: '||fn.proname);
  END LOOP;
  PERFORM pg_temp.assert_true(NOT has_table_privilege('authenticated','whatsapp_delivery_facts','SELECT,INSERT,UPDATE,DELETE'),'No direct delivery fact access');
END $$;
GRANT EXECUTE ON FUNCTION complete_whatsapp_command(uuid,uuid,text,text) TO authenticated;
SELECT pg_temp.assert_true(whatsapp_human_outbox_protocol_version()=0,'Unsafe new grants stop human dispatch');
REVOKE EXECUTE ON FUNCTION complete_whatsapp_command(uuid,uuid,text,text) FROM authenticated;
SELECT pg_temp.assert_true(whatsapp_guarded_dispatch_ready(),'Guarded dispatch is available with private RPCs');
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM claim_whatsapp_human_outbox(); RAISE EXCEPTION 'DIRECT_CLAIM';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM whatsapp_delivery_facts; RAISE EXCEPTION 'DIRECT_FACTS';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- The agent's old job cannot be reclaimed after a seller takes the chat.
DO $$ DECLARE chat_id uuid; result jsonb; BEGIN
  SELECT sending_race_c INTO chat_id FROM whatsapp_control_fixture;
  UPDATE whatsapp_outbox SET lease_expires_at=clock_timestamp()-interval '1 second'
    WHERE conversation_id=chat_id AND origin='AGENT' AND status='SENDING';
  result:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(result IS NULL AND EXISTS(SELECT 1 FROM whatsapp_outbox
    WHERE conversation_id=chat_id AND origin='AGENT' AND status='UNKNOWN'),'Orphaned agent reservation expires even under human control');
END $$;
DO $$ DECLARE f whatsapp_human_fixture%ROWTYPE; r jsonb; retry jsonb; cmd uuid; x jsonb; actor uuid; ts timestamptz; BEGIN
  SELECT * INTO f FROM whatsapp_human_fixture;
  PERFORM pg_temp.assert_true(whatsapp_human_outbox_protocol_version()=1,'Human protocol installed');
  -- Even an accepted sandbox chat must never enter the live provider outbox.
  BEGIN PERFORM enqueue_whatsapp_human_message(f.org,(SELECT sim_c FROM whatsapp_control_fixture),f.a,2,gen_random_uuid(),'Sandbox');
    RAISE EXCEPTION 'SANDBOX_OUTBOX'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM control_whatsapp_conversation(f.org,f.chat,f.a,0,'CLAIM');
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,f.request_id,'Hola');
  PERFORM pg_temp.assert_true(r->>'code'='WINDOW_EXPIRED','No provider evidence fails closed');
  -- p_received_at is a visual fallback. It cannot authorize a window on its own.
  PERFORM ingest_whatsapp_inbound_message('control-test-phone','5491100000201','human-no-evidence','TEXT','Hola','{}',clock_timestamp());
  PERFORM pg_temp.assert_true((SELECT last_customer_message_at IS NULL FROM whatsapp_conversations WHERE id=f.chat),'Fallback does not extend window');
  PERFORM ingest_whatsapp_inbound_message('control-test-phone','5491100000201','human-future','TEXT','Hola',
    jsonb_build_object('id','human-future','timestamp',floor(extract(epoch FROM clock_timestamp()+interval '1 day'))::text));
  PERFORM pg_temp.assert_true((SELECT last_customer_message_at IS NULL FROM whatsapp_conversations WHERE id=f.chat),'Future timestamp rejected');
  PERFORM ingest_whatsapp_inbound_message('control-test-phone','5491100000201','human-valid','TEXT','Hola',
    jsonb_build_object('id','human-valid','timestamp',floor(extract(epoch FROM clock_timestamp()))::text));
  SELECT last_customer_message_at INTO ts FROM whatsapp_conversations WHERE id=f.chat;
  PERFORM ingest_whatsapp_inbound_message('control-test-phone','5491100000201','human-older','TEXT','Hola',
    jsonb_build_object('id','human-older','timestamp',floor(extract(epoch FROM clock_timestamp()-interval '2 days'))::text));
  PERFORM pg_temp.assert_true((SELECT last_customer_message_at=ts FROM whatsapp_conversations WHERE id=f.chat),'Window is monotonic');
  FOR actor IN SELECT unnest(ARRAY[f.reader,f.stranger]) LOOP
    BEGIN PERFORM enqueue_whatsapp_human_message(f.org,f.chat,actor,1,f.request_id,'Hola'); RAISE EXCEPTION 'FORBIDDEN_ENQUEUE';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN PERFORM enqueue_whatsapp_human_message(f.foreign_org,f.chat,f.stranger,1,f.request_id,'Hola'); RAISE EXCEPTION 'FOREIGN_ENQUEUE';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,1,f.request_id,'Hola');
  PERFORM pg_temp.assert_true(r->>'code'='CONTROL_CONFLICT','Other seller cannot send');
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,0,f.request_id,'Hola');
  PERFORM pg_temp.assert_true(r->>'code'='CONTROL_CONFLICT','Version is checked at acceptance');
  UPDATE organizations SET whatsapp_enabled=false WHERE id=f.org;
  BEGIN PERFORM enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,f.request_id,'Hola'); RAISE EXCEPTION 'DISABLED_ENQUEUE';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE organizations SET whatsapp_enabled=true WHERE id=f.org;
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,f.request_id,' Hola '); cmd:=(r->'command'->>'id')::uuid;
  retry:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,f.request_id,'Hola');
  PERFORM pg_temp.assert_true((r->>'success')::boolean AND retry->>'replayed'='true' AND retry->'command'->>'id'=cmd::text,'Same key returns durable command');
  PERFORM pg_temp.assert_true((SELECT source_message_id IS NULL AND origin='HUMAN' FROM whatsapp_outbox WHERE id=cmd),'No invented inbound');
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,f.request_id,'Otro texto');
  PERFORM pg_temp.assert_true(r->>'code'='IDEMPOTENCY_CONFLICT','Changed content is rejected');
  r:=enqueue_whatsapp_human_message(f.org,f.other_chat,f.a,1,f.request_id,'Hola');
  PERFORM pg_temp.assert_true(r->>'code'='IDEMPOTENCY_CONFLICT','Request keys are unique across chats');
  x:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(x->>'id'=cmd::text AND x->>'status'='SENDING','Worker reserves saved command');
  PERFORM pg_temp.assert_true(claim_whatsapp_human_outbox() IS NULL,'Second worker cannot reserve it');
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,gen_random_uuid(),'Segundo');
  PERFORM pg_temp.assert_true(r->>'code'='DELIVERY_UNRESOLVED','SENDING blocks another command');
  PERFORM pg_temp.assert_true(NOT complete_whatsapp_command(cmd,gen_random_uuid(),'SENT','human-accepted'),'Wrong lease cannot finish');
  -- Early, duplicate and out-of-order callbacks are scoped and retained.
  PERFORM record_whatsapp_delivery_status_scoped('control-test-phone','human-accepted','READ',ts);
  PERFORM record_whatsapp_delivery_status_scoped('control-test-phone','human-accepted','READ',ts);
  PERFORM pg_temp.assert_true(complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'SENT','human-accepted'),'Complete accepted result');
  PERFORM pg_temp.assert_true(complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'SENT','human-accepted'),'Lost acknowledgement is idempotent');
  PERFORM pg_temp.assert_true(NOT complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'SENT','different-id'),'Conflicting ID rejected');
  PERFORM record_whatsapp_delivery_status_scoped('control-test-phone','human-accepted','DELIVERED',clock_timestamp());
  PERFORM record_whatsapp_delivery_status_scoped('control-test-phone','human-accepted','FAILED',clock_timestamp());
  PERFORM pg_temp.assert_true((SELECT delivery_status='READ' AND origin='HUMAN' AND sender_user_id=f.a AND content='Hola' FROM whatsapp_messages WHERE external_message_id='human-accepted'),'Early READ reconciled, author preserved, no downgrade');
  PERFORM pg_temp.assert_true((SELECT count(*)=3 FROM whatsapp_delivery_facts WHERE external_message_id='human-accepted'),'Contradictory facts retained');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM whatsapp_messages WHERE external_message_id='human-accepted'),'Completion creates one bubble');
  -- Exact replays still work after control changes, provided access is current.
  PERFORM control_whatsapp_conversation(f.org,f.chat,f.a,1,'TRANSFER',f.b);
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.a,1,f.request_id,'Hola');
  PERFORM pg_temp.assert_true(r->>'replayed'='true','Replay survives control transition');

  -- Dispatch revalidates revoked permissions, flags and the 24h window.
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,2,gen_random_uuid(),'No por ventana'); cmd:=(r->'command'->>'id')::uuid;
  UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp()-interval '24 hours' WHERE id=f.chat;
  x:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(x IS NULL AND (SELECT reason_code='WINDOW_EXPIRED' FROM whatsapp_outbox WHERE id=cmd),'Expiry at dispatch cancels command');
  UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp() WHERE id=f.chat;
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,2,gen_random_uuid(),'Vence después de la reserva');
  cmd:=(r->'command'->>'id')::uuid; x:=claim_whatsapp_human_outbox();
  UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp()-interval '24 hours' WHERE id=f.chat;
  PERFORM pg_temp.assert_true(NOT complete_whatsapp_command(cmd,gen_random_uuid(),'WINDOW_EXPIRED'),'Expiry requires the dispatch lease');
  PERFORM pg_temp.assert_true(complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'WINDOW_EXPIRED'),'Worker can record expiry before HTTP');
  PERFORM pg_temp.assert_true(complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'WINDOW_EXPIRED'),'Expiry completion is idempotent');
  PERFORM pg_temp.assert_true((SELECT status='CANCELLED' AND reason_code='WINDOW_EXPIRED' AND external_message_id IS NULL
    FROM whatsapp_outbox WHERE id=cmd) AND claim_whatsapp_human_outbox() IS NULL,'Expired command is terminal without a provider ID');
  UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp() WHERE id=f.chat;
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,2,gen_random_uuid(),'No por permiso'); cmd:=(r->'command'->>'id')::uuid;
  UPDATE organization_members SET is_active=false WHERE organization_id=f.org AND user_id=f.b;
  x:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(x IS NULL AND (SELECT reason_code='ACCESS_REVOKED' FROM whatsapp_outbox WHERE id=cmd),'Permission revoked before dispatch');
  UPDATE organization_members SET is_active=true WHERE organization_id=f.org AND user_id=f.b;
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,2,gen_random_uuid(),'No por flag'); cmd:=(r->'command'->>'id')::uuid;
  UPDATE organizations SET whatsapp_enabled=false WHERE id=f.org;
  x:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(x IS NULL AND (SELECT reason_code='CHANNEL_UNAVAILABLE' FROM whatsapp_outbox WHERE id=cmd),'Flag revoked before dispatch');
  UPDATE organizations SET whatsapp_enabled=true WHERE id=f.org;
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,2,gen_random_uuid(),'No por pausa'); cmd:=(r->'command'->>'id')::uuid;
  PERFORM control_whatsapp_conversation(f.org,f.chat,f.a,2,'PAUSE');
  PERFORM pg_temp.assert_true((SELECT status='CANCELLED' FROM whatsapp_outbox WHERE id=cmd),'Pause cancels pending human commands');
  PERFORM control_whatsapp_conversation(f.org,f.chat,f.b,3,'CLAIM');

  -- Equal intentional texts with new request IDs remain separate commands.
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,4,gen_random_uuid(),'Hola'); cmd:=(r->'command'->>'id')::uuid;
  x:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'PENDING'),'429 can retry');
  PERFORM pg_temp.assert_true(claim_whatsapp_human_outbox() IS NULL,'429 backoff is respected');
  UPDATE whatsapp_outbox SET available_at=clock_timestamp() WHERE id=cmd;
  x:=claim_whatsapp_human_outbox();
  UPDATE whatsapp_outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=cmd;
  x:=claim_whatsapp_human_outbox();
  PERFORM pg_temp.assert_true(x IS NULL AND (SELECT status='UNKNOWN' FROM whatsapp_outbox WHERE id=cmd),'Crash becomes UNKNOWN without replay');
  PERFORM pg_temp.assert_true(NOT complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'PENDING'),'UNKNOWN never returns to queue');
  r:=resolve_whatsapp_unknown(f.org,f.chat,cmd,f.b,3,'CANCELLED','Revisado por vendedor');
  PERFORM pg_temp.assert_true(r->>'code'='CONTROL_CONFLICT','Review requires current version');
  BEGIN PERFORM resolve_whatsapp_unknown(f.org,f.chat,cmd,f.reader,4,'CANCELLED','Revisado por vendedor'); RAISE EXCEPTION 'READER_REVIEW';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE whatsapp_conversations SET pending_order_action='{"kind":"CONFIRM_PRE_SALE"}' WHERE id=f.chat;
  r:=resolve_whatsapp_unknown(f.org,f.chat,cmd,f.b,4,'CANCELLED','Revisado en el teléfono, no reenviar');
  PERFORM pg_temp.assert_true((r->>'success')::boolean AND (SELECT count(*)=1 FROM whatsapp_conversation_events WHERE command_id=cmd AND type='DELIVERY_REVIEW'),'Explicit review is audited');
  PERFORM pg_temp.assert_true((SELECT pending_order_action IS NULL FROM whatsapp_conversations WHERE id=f.chat),'Review invalidates old commercial authorization');
  r:=resolve_whatsapp_unknown(f.org,f.chat,cmd,f.b,5,'CANCELLED','Repetición de revisión');
  PERFORM pg_temp.assert_true(r->>'code'='REVIEW_CONFLICT','Review cannot be repeated');
  r:=enqueue_whatsapp_human_message(f.org,f.chat,f.b,5,gen_random_uuid(),'Hola');
  cmd:=(r->'command'->>'id')::uuid; x:=claim_whatsapp_human_outbox();
  PERFORM complete_whatsapp_command(cmd,(x->>'lease_token')::uuid,'UNKNOWN');
  r:=resolve_whatsapp_unknown(f.org,f.chat,cmd,f.b,5,'SENT','Aceptado, identificado en registro de Meta','human-reviewed-id');
  PERFORM pg_temp.assert_true((r->>'success')::boolean AND (SELECT status='SENT' FROM whatsapp_outbox WHERE id=cmd),'Known ID can be reconciled without POST');
  PERFORM control_whatsapp_conversation(f.org,f.chat,f.b,6,'RESUME');
  PERFORM pg_temp.assert_true((SELECT status='ACTIVE' AND pending_order_action IS NULL FROM whatsapp_conversations WHERE id=f.chat),'Resume after review preserves control contract');
END $$;
DO $$ DECLARE f whatsapp_human_fixture%ROWTYPE; j agent_jobs%ROWTYPE; src uuid; result jsonb; BEGIN
  SELECT * INTO f FROM whatsapp_human_fixture;
  UPDATE agent_jobs SET status='CANCELLED' WHERE organization_id=f.org;
  SELECT message_id INTO src FROM ingest_whatsapp_inbound_message('control-test-phone','5491100000202','agent-window-expired','TEXT','Hola',
    jsonb_build_object('id','agent-window-expired','timestamp',floor(extract(epoch FROM clock_timestamp()-interval '2 days'))::text));
  SELECT * INTO j FROM claim_whatsapp_job_v2('expired-window','PROCESS_CONVERSATION','DAEMON', (SELECT id FROM agent_jobs WHERE source_message_id=src));
  result:=prepare_whatsapp_outbox(j.id,j.lease_token,'No enviar fuera de ventana');
  PERFORM pg_temp.assert_true(result->>'status'='CANCELLED','Agent shares the real customer window');
END $$;
BEGIN;
SELECT control_whatsapp_conversation(org,other_chat,a,0,'CLAIM') FROM whatsapp_human_fixture;
UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp() WHERE id=(SELECT other_chat FROM whatsapp_human_fixture);
SELECT enqueue_whatsapp_human_message(org,other_chat,a,1,gen_random_uuid(),'Grant incorrecto') FROM whatsapp_human_fixture;
GRANT EXECUTE ON FUNCTION guard_whatsapp_human_dispatch(uuid,uuid,text,text) TO authenticated;
SELECT pg_temp.assert_true(NOT whatsapp_guarded_dispatch_ready() AND reserve_whatsapp_human_dispatch() IS NULL,
  'Unsafe guard grants disable the protocol and block new reservations');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM whatsapp_outbox WHERE conversation_id=(SELECT other_chat FROM whatsapp_human_fixture)
  AND text='Grant incorrecto' AND status='PENDING' AND lease_token IS NULL),'Blocked reservations leave commands pending');
ROLLBACK;
-- Exercise the guard after reservation, with the same service role as the worker.
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
DO $$
DECLARE
  f whatsapp_human_fixture%ROWTYPE;
  x jsonb;
  command_id uuid;
  lease uuid;
  reason text;
BEGIN
  SELECT * INTO f FROM whatsapp_human_fixture;
  PERFORM control_whatsapp_conversation(f.org,f.other_chat,f.a,0,'CLAIM');
  FOREACH reason IN ARRAY ARRAY['ACCESS_REVOKED','CHANNEL_UNAVAILABLE','WINDOW_EXPIRED','CONTROL_CONFLICT'] LOOP
    UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp() WHERE id=f.other_chat;
    x:=enqueue_whatsapp_human_message(f.org,f.other_chat,f.a,1,gen_random_uuid(),'Antes del HTTP');
    command_id:=(x->'command'->>'id')::uuid;
    x:=reserve_whatsapp_human_dispatch();
    lease:=(x->>'lease_token')::uuid;
    PERFORM pg_temp.assert_true((x->>'id')::uuid=command_id,'New reservation RPC works as service_role');
    PERFORM pg_temp.assert_true(guard_whatsapp_human_dispatch(command_id,gen_random_uuid(),x->>'phone_number_id',x->>'recipient') IS NULL,
      'A stale lease cannot authorize or cancel a reservation');
    UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp() WHERE id=f.other_chat;
    PERFORM pg_temp.assert_true(
      guard_whatsapp_human_dispatch(command_id,lease,x->>'phone_number_id',x->>'recipient')
        =(SELECT last_customer_message_at+interval '24 hours' FROM whatsapp_conversations WHERE id=f.other_chat),
      'Guard returns the current deadline, including inbound after reservation');

    CASE reason
      WHEN 'ACCESS_REVOKED' THEN UPDATE organization_members SET is_active=false WHERE organization_id=f.org AND user_id=f.a;
      WHEN 'CHANNEL_UNAVAILABLE' THEN UPDATE organizations SET whatsapp_enabled=false WHERE id=f.org;
      WHEN 'WINDOW_EXPIRED' THEN UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp()-interval '24 hours' WHERE id=f.other_chat;
      WHEN 'CONTROL_CONFLICT' THEN PERFORM control_whatsapp_conversation(f.org,f.other_chat,f.a,1,'TRANSFER',f.b);
    END CASE;
    PERFORM pg_temp.assert_true(guard_whatsapp_human_dispatch(command_id,lease,x->>'phone_number_id',x->>'recipient') IS NULL,
      'Guard denies an unsent command: '||reason);
    PERFORM pg_temp.assert_true((SELECT status='CANCELLED' AND reason_code=reason AND external_message_id IS NULL
      FROM whatsapp_outbox WHERE id=command_id),'Known rejection is terminal: '||reason);
    UPDATE organization_members SET is_active=true WHERE organization_id=f.org AND user_id=f.a;
    UPDATE organizations SET whatsapp_enabled=true WHERE id=f.org;
  END LOOP;
END $$;
ROLLBACK;
-- Prepare a separate accepted chat for real two-session enqueue/claim races.
UPDATE whatsapp_conversations SET last_customer_message_at=clock_timestamp() WHERE id=(SELECT race_chat FROM whatsapp_human_fixture);
SELECT control_whatsapp_conversation(org,race_chat,a,0,'CLAIM') FROM whatsapp_human_fixture;
SELECT 'PASS: human commands, window evidence, tenant/permissions, idempotency, dispatch, UNKNOWN, review and early callbacks';
