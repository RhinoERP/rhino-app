-- Run after human-control/human-outbox, with the effective grants of the bundle.
CREATE TABLE inbox_fixture AS SELECT
  gen_random_uuid() chat, gen_random_uuid() older, gen_random_uuid() newer,
  gen_random_uuid() audio, gen_random_uuid() source_id;
INSERT INTO role_permissions(role_id,permission_id)
SELECT f.manage_role,p.id FROM whatsapp_control_fixture f JOIN permissions p ON p.key='whatsapp.read'
ON CONFLICT DO NOTHING;
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone,last_message_at)
SELECT i.chat,f.org,f.wi,'5491112345678',clock_timestamp()
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i;
INSERT INTO whatsapp_conversations(organization_id,integration_id,customer_phone,last_message_at)
SELECT f.org,f.wi,'54911001'||v.number,statement_timestamp()-v.number*interval '1 minute'
FROM whatsapp_control_fixture f CROSS JOIN generate_series(1,750) AS v(number);
INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content,payload)
SELECT f.org,f.wi,i.chat,'inbox-load-'||v.number,'INBOUND','Mensaje '||v.number,'{"secret":"no debe salir"}'
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i CROSS JOIN generate_series(1,2500) AS v(number);
INSERT INTO whatsapp_messages(id,organization_id,integration_id,conversation_id,external_message_id,direction,content,created_at)
SELECT v.id,f.org,f.wi,i.chat,v.external_id,'INBOUND','cursor',$date$2020-01-01T00:00:00Z$date$::timestamptz
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i
CROSS JOIN LATERAL (VALUES(i.older,'inbox-older'),(i.newer,'inbox-newer')) v(id,external_id);
-- One source and one real handoff, even on a tool retry.
INSERT INTO whatsapp_messages(id,organization_id,integration_id,conversation_id,external_message_id,direction,content,payload)
SELECT i.source_id,f.org,f.wi,i.chat,'inbox-source','INBOUND','Necesito hablar con alguien',
  jsonb_build_object('id','inbox-source','timestamp',floor(extract(epoch FROM clock_timestamp()))::text,'private','provider payload')
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i;
SELECT handoff_whatsapp_conversation(f.org,f.wi,i.chat,i.source_id,'Consulta requiere atención')
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i;
SELECT handoff_whatsapp_conversation(f.org,f.wi,i.chat,i.source_id,'Reintento')
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i;

UPDATE organizations SET whatsapp_audio_enabled=true FROM whatsapp_control_fixture f WHERE id=f.org;
INSERT INTO whatsapp_messages(id,organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,payload)
SELECT i.audio,f.org,f.wi,i.chat,'inbox-audio','INBOUND','AUDIO','Transcripción de prueba','{"audio":{"id":"provider-media"}}'
FROM whatsapp_control_fixture f CROSS JOIN inbox_fixture i;
UPDATE whatsapp_audio_assets SET stored=true,status='SUCCEEDED',mime_type='audio/ogg'
WHERE message_id=(SELECT audio FROM inbox_fixture);

ANALYZE whatsapp_messages;
ANALYZE whatsapp_conversations;
ANALYZE whatsapp_conversation_events;

SET ROLE service_role;
DO $$
DECLARE f whatsapp_control_fixture; i inbox_fixture; result jsonb; next jsonb; boundary jsonb; a_count int; b_count int;
BEGIN
  SELECT * INTO f FROM whatsapp_control_fixture;
  SELECT * INTO i FROM inbox_fixture;
  result := list_whatsapp_inbox(f.org,f.reader,'all','');
  IF jsonb_array_length(result->'rows') <> 31 OR result->'rows'->0->>'id' <> i.chat::text
    OR result->'rows'->0->'preview'->>'type' <> 'AUDIO' OR (result->'rows'->0->>'unread')::int <> 100
    OR result::text LIKE '%storage_path%' THEN RAISE EXCEPTION 'Invalid list DTO or unbounded page'; END IF;
  boundary := result->'rows'->29;
  next := list_whatsapp_inbox(f.org,f.reader,'all','',(boundary->>'at')::timestamptz,(boundary->>'id')::uuid);
  IF next->'rows'->0->>'id' <> result->'rows'->30->>'id' THEN RAISE EXCEPTION 'List cursor skipped lookahead'; END IF;
  result := list_whatsapp_inbox(f.org,f.reader,'attention','12345678');
  IF jsonb_array_length(result->'rows') <> 1 OR (result->>'attentionCount')::int < 1
    OR jsonb_array_length(list_whatsapp_inbox(f.org,f.reader,'all','SIMULACIÓN')->'rows') <> 0
    OR jsonb_array_length(list_whatsapp_inbox(f.org,f.reader,'simulation','SIMULACIÓN')->'rows') <> 1
    THEN RAISE EXCEPTION 'Search, attention or sandbox projection is wrong'; END IF;

  result := get_whatsapp_inbox_detail(f.org,f.reader,i.chat);
  IF (result->>'canManage')::boolean OR result->>'windowEndsAt' IS NULL OR NOT (result->>'audioEnabled')::boolean
    OR result->>'handoffReason' <> 'Consulta requiere atención' OR result->>'humanClaimedAt' IS NOT NULL
    OR result::text LIKE '%pending_order_action%' THEN RAISE EXCEPTION 'Invalid detail projection'; END IF;
  BEGIN
    PERFORM get_whatsapp_inbox_detail(f.org,f.stranger,i.chat);
    RAISE EXCEPTION 'Cross tenant detail accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM get_whatsapp_inbox_history(f.org,f.no_permission,i.chat);
    RAISE EXCEPTION 'Reader permission bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM mark_whatsapp_inbox_read(f.org,f.reader,f.c,i.audio);
    RAISE EXCEPTION 'Cross chat read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM mark_whatsapp_inbox_read(f.org,f.reader,i.chat,i.source_id);
  PERFORM mark_whatsapp_inbox_read(f.org,f.reader,i.chat,i.older);
  SELECT (list_whatsapp_inbox(f.org,f.reader,'all','12345678')->'rows'->0->>'unread')::int,
    (list_whatsapp_inbox(f.org,f.owner,'all','12345678')->'rows'->0->>'unread')::int INTO a_count,b_count;
  IF a_count <> 1 OR b_count <> 100 OR (get_whatsapp_inbox_detail(f.org,f.reader,i.chat)->'readCursor'->>'id') <> i.source_id::text
    OR NOT EXISTS(SELECT 1 FROM whatsapp_conversations WHERE id=i.chat AND status='HANDOFF' AND human_claimed_at IS NULL)
    THEN RAISE EXCEPTION 'Read marker regressed or changed another reader/control'; END IF;

  result := get_whatsapp_inbox_history(f.org,f.reader,i.chat);
  IF jsonb_array_length(result) <> 51 OR result->0->>'id' <> i.audio::text OR result->0->>'audioStatus' <> 'SUCCEEDED'
    OR result::text LIKE '%provider payload%' OR result::text LIKE '%provider-media%' OR result::text LIKE '%no debe salir%'
    THEN RAISE EXCEPTION 'Unsafe or unbounded history DTO'; END IF;
  boundary := result->49;
  next := get_whatsapp_inbox_history(f.org,f.reader,i.chat,(boundary->>'at')::timestamptz,(boundary->>'id')::uuid,false);
  IF next->0->>'id' <> result->50->>'id' THEN RAISE EXCEPTION 'Backward cursor skipped lookahead'; END IF;
  SELECT jsonb_build_object('at',coalesce(inbox_at,created_at),'id',id) INTO boundary FROM whatsapp_messages WHERE id=i.older;
  next := get_whatsapp_inbox_history(f.org,f.reader,i.chat,(boundary->>'at')::timestamptz,i.older,true);
  IF next->0->>'id' <> i.newer::text OR next->1->>'id' <> i.source_id::text
    OR next->2->>'type' <> 'HANDOFF' OR next->3->>'id' <> i.audio::text THEN RAISE EXCEPTION 'Forward timeline is out of order'; END IF;

  IF get_whatsapp_inbox_audio(f.org,f.reader,i.chat,i.audio)->>'mime' <> 'audio/ogg'
    OR get_whatsapp_inbox_audio(f.org,f.reader,f.c,i.audio) IS NOT NULL
    THEN RAISE EXCEPTION 'Audio routing did not enforce chat scope'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE f whatsapp_control_fixture; i inbox_fixture;
BEGIN
  SELECT * INTO f FROM whatsapp_control_fixture;
  SELECT * INTO i FROM inbox_fixture;
  IF (SELECT count(*) FROM notifications WHERE type='whatsapp_handoff' AND link LIKE '%'||i.chat::text) <> 1
    OR NOT EXISTS(SELECT 1 FROM notifications WHERE type='whatsapp_handoff' AND link LIKE '%'||i.chat::text AND user_id=f.a)
    THEN RAISE EXCEPTION 'Handoff alert missing, duplicated or sent to the wrong operator'; END IF;
  PERFORM set_config('request.jwt.claim.sub',f.reader::text,true);
  PERFORM mark_notification_read(n.id) FROM notifications n WHERE n.link LIKE '%'||i.chat::text;
  IF EXISTS(SELECT 1 FROM notifications WHERE link LIKE '%'||i.chat::text AND is_read)
    THEN RAISE EXCEPTION 'A different user marked the alert read'; END IF;
  PERFORM set_config('request.jwt.claim.sub',f.a::text,true);
  PERFORM mark_notification_read(n.id) FROM notifications n WHERE n.link LIKE '%'||i.chat::text;
  IF NOT EXISTS(SELECT 1 FROM notifications WHERE link LIKE '%'||i.chat::text AND is_read AND read_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Assigned user could not mark the alert read'; END IF;
  IF NOT EXISTS(SELECT 1 FROM whatsapp_conversations WHERE id=i.chat AND status='HANDOFF' AND human_claimed_at IS NULL)
    THEN RAISE EXCEPTION 'Bell read claimed a conversation'; END IF;

  UPDATE whatsapp_audio_assets SET expires_at=now()-interval '1 second' WHERE message_id=i.audio;
  IF get_whatsapp_inbox_audio(f.org,f.reader,i.chat,i.audio) IS NOT NULL THEN RAISE EXCEPTION 'Expired audio exposed'; END IF;
  UPDATE whatsapp_audio_assets SET expires_at=now()+interval '1 hour' WHERE message_id=i.audio;
  UPDATE organizations SET whatsapp_audio_enabled=false WHERE id=f.org;
  IF get_whatsapp_inbox_audio(f.org,f.reader,i.chat,i.audio) IS NOT NULL
    OR get_whatsapp_inbox_history(f.org,f.reader,i.chat)->0->>'content' IS NOT NULL THEN RAISE EXCEPTION 'Disabled audio exposed'; END IF;
  UPDATE organizations SET whatsapp_sandbox_enabled=false WHERE id=f.org;
  BEGIN
    PERFORM get_whatsapp_inbox_detail(f.org,f.reader,f.sim_c);
    RAISE EXCEPTION 'Disabled sandbox exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE organizations SET whatsapp_enabled=false WHERE id=f.org;
  BEGIN
    PERFORM list_whatsapp_inbox(f.org,f.reader,'all','');
    RAISE EXCEPTION 'Disabled module exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE organizations SET whatsapp_enabled=true,whatsapp_sandbox_enabled=true WHERE id=f.org;

  IF EXISTS(SELECT 1 FROM pg_proc p WHERE pronamespace='public'::regnamespace
    AND (p.proname LIKE '%whatsapp_inbox%' OR p.proname='whatsapp_actor_can_read')
    AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE')))
    OR has_table_privilege('authenticated','whatsapp_conversation_reads','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege('authenticated','public.notify_users_by_permission(uuid,text,text,text,text,jsonb,text,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.get_users_by_permission(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.notify_users_by_permission(uuid,text,text,text,text,jsonb,text,uuid)','EXECUTE')
    THEN RAISE EXCEPTION 'Inbox privileges leaked to client roles'; END IF;
END $$;

-- Connect the new inbox read model to a real local control/outbox round trip.
SET ROLE service_role;
DO $$
DECLARE f whatsapp_control_fixture; i inbox_fixture; accepted jsonb; claim jsonb; history jsonb; message uuid;
BEGIN
  SELECT * INTO f FROM whatsapp_control_fixture;
  SELECT * INTO i FROM inbox_fixture;
  IF NOT (control_whatsapp_conversation(f.org,i.chat,f.a,1,'CLAIM')->>'success')::boolean
    THEN RAISE EXCEPTION 'Could not take a handoff from the inbox'; END IF;
  accepted := enqueue_whatsapp_human_message(f.org,i.chat,f.a,2,gen_random_uuid(),'Respuesta humana');
  IF accepted->'command'->>'status' <> 'PENDING'
    OR get_whatsapp_inbox_detail(f.org,f.a,i.chat)->'commands'->0->>'status' <> 'PENDING'
    THEN RAISE EXCEPTION 'Enqueue did not expose a pending command'; END IF;
  claim := claim_whatsapp_human_outbox();
  IF claim->>'id' IS DISTINCT FROM accepted->'command'->>'id'
    THEN RAISE EXCEPTION 'The consumer could not reserve the human command'; END IF;
  PERFORM record_whatsapp_delivery_status_scoped('control-test-phone','inbox-fake-accepted','READ',clock_timestamp());
  IF NOT complete_whatsapp_command((claim->>'id')::uuid,(claim->>'lease_token')::uuid,'SENT','inbox-fake-accepted')
    THEN RAISE EXCEPTION 'Could not record mock provider acceptance'; END IF;
  PERFORM record_whatsapp_delivery_status_scoped('control-test-phone','inbox-fake-accepted','DELIVERED',clock_timestamp());
  history := get_whatsapp_inbox_history(f.org,f.reader,i.chat);
  IF history->0->>'content' <> 'Respuesta humana' OR history->0->>'origin' <> 'HUMAN'
    OR history->0->>'delivery' <> 'READ' OR history::text LIKE '%inbox-fake-accepted%'
    OR jsonb_array_length(get_whatsapp_inbox_detail(f.org,f.reader,i.chat)->'commands') <> 0
    THEN RAISE EXCEPTION 'Provider acceptance or delivery was not reconciled in the inbox'; END IF;
  IF NOT (control_whatsapp_conversation(f.org,i.chat,f.a,2,'RESUME')->>'success')::boolean
    THEN RAISE EXCEPTION 'Could not return the chat to AI'; END IF;
  INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content)
  VALUES(f.org,f.wi,i.chat,'inbox-next-inbound','INBOUND','Un mensaje nuevo') RETURNING id INTO message;
  IF get_whatsapp_inbox_history(f.org,f.reader,i.chat)->0->>'id' <> message::text
    OR get_whatsapp_inbox_detail(f.org,f.reader,i.chat)->>'status' <> 'ACTIVE'
    THEN RAISE EXCEPTION 'Resume did not preserve new inbound history'; END IF;
END $$;
RESET ROLE;

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id FROM whatsapp_messages WHERE conversation_id = (SELECT chat FROM inbox_fixture)
  AND (coalesce(inbox_at,created_at),id) < (
    (SELECT inbox_at FROM whatsapp_messages WHERE external_message_id='inbox-load-2400'), 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
  ORDER BY coalesce(inbox_at,created_at) DESC,id DESC LIMIT 51;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id FROM whatsapp_conversations WHERE organization_id = (SELECT org FROM whatsapp_control_fixture)
  ORDER BY coalesce(last_message_at,created_at) DESC,id DESC LIMIT 31;
SELECT 'PASS: inbox ACL, DTOs, cursors, personal reads, audio gate/expiry and handoff alerts';
