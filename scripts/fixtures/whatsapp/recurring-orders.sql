CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END; $$;
-- Existing fixture has one live integration and one simulator. Restore pilot.
UPDATE organizations SET is_active=true,whatsapp_enabled=true WHERE id='11111111-1111-4111-8111-111111111111';
INSERT INTO customers(id,organization_id) VALUES('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111');
INSERT INTO products(id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT * FROM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-first','TEXT','Quiero comprar un producto','{}',now()-interval '2 days');
CREATE FUNCTION pg_temp.recurring_mutate(op text, cart_id uuid DEFAULT NULL, version integer DEFAULT NULL,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
 UPDATE whatsapp_messages SET created_at=sent_at WHERE direction='INBOUND' AND external_message_id LIKE 'recurring-%';
 RETURN (SELECT mutate_whatsapp_order('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',
 (SELECT id FROM whatsapp_conversations WHERE customer_phone='5491100000099'),
 (SELECT id FROM whatsapp_messages WHERE conversation_id=(SELECT id FROM whatsapp_conversations WHERE customer_phone='5491100000099') AND direction='INBOUND' ORDER BY created_at DESC,id DESC LIMIT 1),op,cart_id,version,payload));
END $$;
DO $$ DECLARE c jsonb; q jsonb; result jsonb; first_sale uuid; second_sale uuid; old_cart uuid; v integer; conv uuid;
BEGIN
 SELECT id INTO conv FROM whatsapp_conversations WHERE customer_phone='5491100000099';
 c:=pg_temp.recurring_mutate('START'); old_cart:=(c->>'id')::uuid;
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM conversation_carts WHERE conversation_id=conv),'one pending cart');
 c:=pg_temp.recurring_mutate('UPSERT',old_cart,(c->>'version')::integer,jsonb_build_object('product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quantity',2,'unit_price',10,'price_snapshot','{}'::jsonb));
 BEGIN PERFORM pg_temp.recurring_mutate('REMOVE',old_cart,1,jsonb_build_object('item_id',gen_random_uuid())); RAISE EXCEPTION 'FAIL stale version'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL stale version' THEN RAISE; END IF; END;
 q:=jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('id',id,'unit_price',10,'price_snapshot','{}'::jsonb)) FROM conversation_cart_items WHERE cart_id=old_cart),'snapshot',jsonb_build_object('fingerprint','f1','total',20));
 c:=pg_temp.recurring_mutate('QUOTE',old_cart,(c->>'version')::integer,q); v:=(c->>'version')::integer;
 first_sale:=gen_random_uuid();
 q:=jsonb_build_object('order',jsonb_build_object('id',first_sale,'customer_id','99999999-9999-4999-8999-999999999999','user_id','33333333-3333-4333-8333-333333333333','total_amount',20),'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quantity',2,'unit_price',10)), 'itemTaxes','[]'::jsonb,'taxes','[]'::jsonb,'fingerprint','f1');
 BEGIN PERFORM pg_temp.recurring_mutate('CONVERT',old_cart,v,q); RAISE EXCEPTION 'FAIL unpresented quote'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL unpresented quote' THEN RAISE; END IF; END;
 INSERT INTO whatsapp_messages(external_message_id,organization_id,integration_id,conversation_id,direction,content,payload,created_at)
 VALUES(gen_random_uuid()::text,'11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',conv,'OUTBOUND','Total 20. ¿Confirmás?',jsonb_build_object('orderPrompt',true,'sourceMessageId',(SELECT id FROM whatsapp_messages WHERE conversation_id=conv AND direction='INBOUND' ORDER BY created_at DESC LIMIT 1)),now()-interval '1 day');
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-conditional','TEXT','sí, pero sacá dos unidades','{}',now()-interval '23 hours');
 BEGIN PERFORM pg_temp.recurring_mutate('CONVERT',old_cart,v,q); RAISE EXCEPTION 'FAIL conditional yes'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL conditional yes' THEN RAISE; END IF; END;
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-confirm','TEXT','sí','{}',now()-interval '22 hours');
 -- Failure in the last table must roll back the order and its items.
 BEGIN PERFORM pg_temp.recurring_mutate('CONVERT',old_cart,v,q || jsonb_build_object('taxes',jsonb_build_array(jsonb_build_object('tax_id',NULL)))); RAISE EXCEPTION 'FAIL partial insert'; EXCEPTION WHEN not_null_violation THEN NULL; END;
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM sales_orders WHERE id=first_sale),'atomic rollback');
 result:=pg_temp.recurring_mutate('CONVERT',old_cart,v,q);
 PERFORM pg_temp.assert_true((result->>'preSaleId')::uuid=first_sale,'conversion succeeds');
 result:=pg_temp.recurring_mutate('CONVERT',old_cart,v,q);
 PERFORM pg_temp.assert_true((result->>'alreadyCreated')::boolean,'retry returns same sale');
 -- Tomorrow: same conversation, new independent cart.
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-tomorrow','TEXT','Quiero otro pedido','{}',now()-interval '1 hour');
 c:=pg_temp.recurring_mutate('START');
 PERFORM pg_temp.assert_true((c->>'id')::uuid<>old_cart,'new cart in same chat');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM conversation_carts WHERE conversation_id=conv AND status='CONVERTED'),'old cart preserved');
 c:=pg_temp.recurring_mutate('REQUEST_ABANDON',(c->>'id')::uuid,(c->>'version')::integer,'{"replace":true}');
 INSERT INTO whatsapp_messages(external_message_id,organization_id,integration_id,conversation_id,direction,content,payload,created_at)
 VALUES(gen_random_uuid()::text,'11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',conv,'OUTBOUND','¿Descartamos?',jsonb_build_object('orderPrompt',true,'sourceMessageId',(SELECT id FROM whatsapp_messages WHERE conversation_id=conv AND direction='INBOUND' ORDER BY created_at DESC LIMIT 1)),now()-interval '30 minutes');
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-replace','TEXT','confirmo','{}',now()-interval '20 minutes');
 BEGIN PERFORM pg_temp.recurring_mutate('CONVERT',(c->>'id')::uuid,(c->>'version')::integer,q); RAISE EXCEPTION 'FAIL wrong action'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL wrong action' THEN RAISE; END IF; END;
 c:=pg_temp.recurring_mutate('ABANDON',(c->>'id')::uuid,(c->>'version')::integer);
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM conversation_carts WHERE conversation_id=conv AND status='ABANDONED'),'abandoned cart preserved');
 c:=pg_temp.recurring_mutate('UPSERT',(c->>'id')::uuid,(c->>'version')::integer,jsonb_build_object('product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quantity',1,'unit_price',10,'price_snapshot','{}'::jsonb));
 c:=pg_temp.recurring_mutate('QUOTE',(c->>'id')::uuid,(c->>'version')::integer,jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('id',id,'unit_price',10,'price_snapshot','{}'::jsonb)) FROM conversation_cart_items WHERE cart_id=(c->>'id')::uuid),'snapshot',jsonb_build_object('fingerprint','f2','total',10)));
 INSERT INTO whatsapp_messages(external_message_id,organization_id,integration_id,conversation_id,direction,content,payload,created_at)
 VALUES(gen_random_uuid()::text,'11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',conv,'OUTBOUND','Total 10. ¿Confirmás?',jsonb_build_object('orderPrompt',true,'sourceMessageId',(SELECT id FROM whatsapp_messages WHERE conversation_id=conv AND direction='INBOUND' ORDER BY created_at DESC LIMIT 1)),now()-interval '10 minutes');
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-second-confirm','TEXT','dale','{}',now()-interval '5 minutes');
 second_sale:=gen_random_uuid();
 result:=pg_temp.recurring_mutate('CONVERT',(c->>'id')::uuid,(c->>'version')::integer,q || jsonb_build_object('order',(q->'order')||jsonb_build_object('id',second_sale,'total_amount',10),'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quantity',1,'unit_price',10)),'fingerprint','f2'));
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM sales_orders WHERE conversation_id=conv),'two sales per chat');
 PERFORM pg_temp.assert_true((SELECT current_pre_sale_id=second_sale FROM whatsapp_conversations WHERE id=conv),'last sale reference updated');
 UPDATE whatsapp_conversations SET status='HANDOFF' WHERE id=conv;
 BEGIN PERFORM pg_temp.recurring_mutate('START'); RAISE EXCEPTION 'FAIL human pause'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL human pause' THEN RAISE; END IF; END;
 UPDATE whatsapp_conversations SET status='ACTIVE',automation_resumed_at=now() WHERE id=conv;
 BEGIN PERFORM pg_temp.recurring_mutate('START'); RAISE EXCEPTION 'FAIL old confirmation after resume'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL old confirmation after resume' THEN RAISE; END IF; END;
END $$;
SELECT pg_temp.assert_true(NOT whatsapp_is_explicit_confirmation('sí, pero sacá dos unidades'),'conditional confirmation rejected');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','mutate_whatsapp_order(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb)','EXECUTE'),'tenant cannot call service state machine');
SELECT 'WhatsApp recurring order checks passed';

-- Prepare one unconverted cart for two genuinely concurrent database sessions.
CREATE TABLE whatsapp_concurrency_fixture (cart_id uuid,version integer,source_id uuid,conversation_id uuid,payload jsonb);
DO $$ DECLARE c jsonb; cv uuid; sid uuid; q jsonb; BEGIN
 SELECT id INTO cv FROM whatsapp_conversations WHERE customer_phone='5491100000099';
 UPDATE whatsapp_conversations SET status='ACTIVE',automation_resumed_at=NULL WHERE id=cv;
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-race-start','TEXT','Quiero repetir el pedido','{}',now()+interval '1 minute');
 c:=pg_temp.recurring_mutate('START');
 c:=pg_temp.recurring_mutate('UPSERT',(c->>'id')::uuid,(c->>'version')::integer,jsonb_build_object('product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quantity',1,'unit_price',10,'price_snapshot','{}'::jsonb));
 c:=pg_temp.recurring_mutate('REQUEST_REPEAT_REVIEW',(c->>'id')::uuid,(c->>'version')::integer,'{"differences":["Precio actualizado"]}');
 BEGIN PERFORM pg_temp.recurring_mutate('QUOTE',(c->>'id')::uuid,(c->>'version')::integer,'{"items":[]}'); RAISE EXCEPTION 'FAIL unreviewed repeat'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL unreviewed repeat' THEN RAISE; END IF; END;
 INSERT INTO whatsapp_messages(external_message_id,organization_id,integration_id,conversation_id,direction,content,payload,created_at)
 VALUES(gen_random_uuid()::text,'11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',cv,'OUTBOUND','¿Aceptás los cambios?',jsonb_build_object('orderPrompt',true,'sourceMessageId',(SELECT id FROM whatsapp_messages WHERE conversation_id=cv AND direction='INBOUND' ORDER BY created_at DESC LIMIT 1)),now()+interval '90 seconds');
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-race-review','TEXT','sí','{}',now()+interval '2 minutes');
 c:=pg_temp.recurring_mutate('ACCEPT_REPEAT',(c->>'id')::uuid,(c->>'version')::integer);
 c:=pg_temp.recurring_mutate('QUOTE',(c->>'id')::uuid,(c->>'version')::integer,jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('id',id,'unit_price',10,'price_snapshot','{}'::jsonb)) FROM conversation_cart_items WHERE cart_id=(c->>'id')::uuid),'snapshot',jsonb_build_object('fingerprint','race','total',10)));
 INSERT INTO whatsapp_messages(external_message_id,organization_id,integration_id,conversation_id,direction,content,payload,created_at)
 VALUES(gen_random_uuid()::text,'11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',cv,'OUTBOUND','¿Confirmás el total 10?',jsonb_build_object('orderPrompt',true,'sourceMessageId',(SELECT id FROM whatsapp_messages WHERE conversation_id=cv AND direction='INBOUND' ORDER BY created_at DESC LIMIT 1)),now()+interval '3 minutes');
 PERFORM ingest_whatsapp_inbound_message('123456','5491100000099','recurring-race-confirm','TEXT','sí','{}',now()+interval '4 minutes');
 UPDATE whatsapp_messages SET created_at=sent_at WHERE direction='INBOUND' AND external_message_id='recurring-race-confirm';
 SELECT id INTO sid FROM whatsapp_messages WHERE external_message_id='recurring-race-confirm';
 q:=jsonb_build_object('order',jsonb_build_object('id',gen_random_uuid(),'customer_id','99999999-9999-4999-8999-999999999999','user_id','33333333-3333-4333-8333-333333333333','total_amount',10),'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','quantity',1,'unit_price',10)),'itemTaxes','[]'::jsonb,'taxes','[]'::jsonb,'fingerprint','race');
 -- Wrong tenant, integration and stale source IDs must not cross the boundary.
 BEGIN PERFORM mutate_whatsapp_order('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555',cv,sid,'CONVERT',(c->>'id')::uuid,(c->>'version')::integer,q); RAISE EXCEPTION 'FAIL wrong tenant'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL wrong tenant' THEN RAISE; END IF; END;
 BEGIN PERFORM mutate_whatsapp_order('11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',cv,sid,'CONVERT',(c->>'id')::uuid,(c->>'version')::integer,q); RAISE EXCEPTION 'FAIL wrong integration'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL wrong integration' THEN RAISE; END IF; END;
 BEGIN PERFORM mutate_whatsapp_order('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',cv,(SELECT id FROM whatsapp_messages WHERE external_message_id='recurring-race-review'),'CONVERT',(c->>'id')::uuid,(c->>'version')::integer,q); RAISE EXCEPTION 'FAIL stale source'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL stale source' THEN RAISE; END IF; END;
 INSERT INTO whatsapp_concurrency_fixture VALUES((c->>'id')::uuid,(c->>'version')::integer,sid,cv,q);
END $$;
CREATE FUNCTION run_whatsapp_concurrency_test() RETURNS jsonb LANGUAGE sql AS $$
 SELECT mutate_whatsapp_order('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',conversation_id,source_id,'CONVERT',cart_id,version,payload) FROM whatsapp_concurrency_fixture;
$$;
