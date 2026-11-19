\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;

CREATE TABLE pricing_fixture AS SELECT gen_random_uuid() org,gen_random_uuid() foreign_org,
  gen_random_uuid() actor,gen_random_uuid() reader,gen_random_uuid() wi,
  gen_random_uuid() x,gen_random_uuid() i,gen_random_uuid() z,gen_random_uuid() foreign_list,
  gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() no_list,
  gen_random_uuid() chat_a,gen_random_uuid() chat_b,gen_random_uuid() chat_c,gen_random_uuid() chat_d,
  gen_random_uuid() race_chat,gen_random_uuid() unlinked;
INSERT INTO organizations(id,whatsapp_enabled) SELECT org,true FROM pricing_fixture
  UNION ALL SELECT foreign_org,true FROM pricing_fixture;
INSERT INTO auth.users(id) SELECT unnest(ARRAY[actor,reader]) FROM pricing_fixture;
INSERT INTO organization_members(organization_id,user_id,is_owner) SELECT org,actor,true FROM pricing_fixture
  UNION ALL SELECT org,reader,false FROM pricing_fixture;
INSERT INTO sales_price_lists(id,organization_id)
  SELECT unnest(ARRAY[x,i,z]),org FROM pricing_fixture UNION ALL SELECT foreign_list,foreign_org FROM pricing_fixture;
INSERT INTO whatsapp_integrations(id,organization_id,phone_number_id,status,sales_price_list_id,responsible_user_id)
  SELECT wi,org,'pricing-fixture','ACTIVE',x,actor FROM pricing_fixture;
INSERT INTO customers(id,organization_id,phone,business_name,sales_price_list_id)
  SELECT a,org,'(011) 15-1234-5678','A',i FROM pricing_fixture UNION ALL
  SELECT b,org,'+54 9 11 9876-5432','B',z FROM pricing_fixture UNION ALL
  SELECT no_list,org,'+54 9 11 2222-4444','D',NULL FROM pricing_fixture UNION ALL
  SELECT unlinked,org,NULL,'Sin teléfono',i FROM pricing_fixture UNION ALL
  SELECT gen_random_uuid(),foreign_org,'+54 9 11 1234-5678','Externo',foreign_list FROM pricing_fixture;
INSERT INTO whatsapp_conversations(id,organization_id,integration_id,customer_phone,customer_id)
  SELECT chat_a,org,wi,'5491112345678',b FROM pricing_fixture UNION ALL
  SELECT chat_b,org,wi,'5491198765432',NULL FROM pricing_fixture UNION ALL
  SELECT chat_c,org,wi,'5491123334444',a FROM pricing_fixture UNION ALL
  SELECT chat_d,org,wi,'5491122224444',NULL FROM pricing_fixture UNION ALL
  SELECT race_chat,org,wi,'5491188881111',NULL FROM pricing_fixture;

CREATE FUNCTION pg_temp.price_job(org uuid,wi uuid,chat uuid,external_id text) RETURNS agent_jobs LANGUAGE plpgsql AS $$
DECLARE source uuid; job uuid; result agent_jobs;
BEGIN
  INSERT INTO whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,content,created_at,payload)
    VALUES(org,wi,chat,external_id,'INBOUND','Precio',clock_timestamp(),jsonb_build_object('id',external_id,'timestamp',floor(extract(epoch FROM clock_timestamp()))::text))
    RETURNING id INTO source;
  INSERT INTO agent_jobs(organization_id,integration_id,conversation_id,source_message_id,job_type,execution_mode)
    VALUES(org,wi,chat,source,'PROCESS_CONVERSATION','DAEMON') ON CONFLICT DO NOTHING;
  SELECT id INTO job FROM agent_jobs WHERE source_message_id=source AND job_type='PROCESS_CONVERSATION';
  SELECT * INTO result FROM claim_whatsapp_job_v2('pricing-test','PROCESS_CONVERSATION','DAEMON',job);
  RETURN result;
END $$;

DO $$
DECLARE f pricing_fixture%ROWTYPE; p jsonb; job agent_jobs; cart uuid; key text;
BEGIN
  SELECT * INTO f FROM pricing_fixture;
  PERFORM pg_temp.assert_true((whatsapp_pricing_context(f.org,f.wi,f.chat_a)->>'listId')::uuid=f.x,'Legacy default is the integration list');
  PERFORM pg_temp.assert_true(whatsapp_phone_key('0054 9 11 1234-5678')='5491112345678'
    AND whatsapp_phone_key('011 15 1234-5678')='5491112345678'
    AND whatsapp_phone_key('011 1234-5678')='541112345678'
    AND whatsapp_phone_key('011 15 1234-5678 int 9') IS NULL,'Full phone and distinct landline handling');
  UPDATE whatsapp_integrations SET pricing_mode='CUSTOMER_OR_GENERAL' WHERE id=f.wi;
  p := whatsapp_pricing_context(f.org,f.wi,f.chat_a);
  PERFORM pg_temp.assert_true((p->>'listId')::uuid=f.i AND (p->>'customerId')::uuid=f.a,'I replaces incorrect stored link');
  PERFORM pg_temp.assert_true((whatsapp_pricing_context(f.org,f.wi,f.chat_b)->>'listId')::uuid=f.z,'Second customer gets Z');
  PERFORM pg_temp.assert_true((whatsapp_pricing_context(f.org,f.wi,f.chat_c)->>'listId')::uuid=f.x,'Unknown contact gets X');
  PERFORM pg_temp.assert_true(whatsapp_pricing_context(f.org,f.wi,f.chat_d)->>'reason'='CUSTOMER_WITHOUT_LIST','General fallback starts off');
  UPDATE whatsapp_integrations SET allow_general_for_customers=true WHERE id=f.wi;
  PERFORM pg_temp.assert_true((whatsapp_pricing_context(f.org,f.wi,f.chat_d)->>'listId')::uuid=f.x,'Explicit customer fallback');

  INSERT INTO customers(organization_id,business_name,phone,sales_price_list_id)
    VALUES(f.org,'Duplicado','5491112345678',f.z);
  PERFORM pg_temp.assert_true(whatsapp_pricing_context(f.org,f.wi,f.chat_a)->>'reason'='AMBIGUOUS_PHONE','Duplicate stays blocked with legacy link');
  UPDATE customers SET is_active=false WHERE organization_id=f.org AND business_name='Duplicado';
  UPDATE customers SET sales_price_list_id=f.foreign_list WHERE id=f.a;
  PERFORM pg_temp.assert_true(whatsapp_pricing_context(f.org,f.wi,f.chat_a)->>'reason'='LIST_UNAVAILABLE','Cross-tenant list is rejected');
  UPDATE customers SET sales_price_list_id=f.i WHERE id=f.a;
  UPDATE whatsapp_integrations SET pricing_mode='REGISTERED_ONLY',allow_general_for_customers=false,sales_price_list_id=NULL WHERE id=f.wi;

  job := pg_temp.price_job(f.org,f.wi,f.chat_c,'pricing-unknown');
  p := whatsapp_job_pricing(job.id,job.lease_token);
  PERFORM pg_temp.assert_true(p->>'reason'='UNREGISTERED','Restricted sender blocked before model');
  PERFORM pg_temp.assert_true((get_whatsapp_inbox_detail(f.org,f.actor,f.chat_c)->>'pricingReview')='UNREGISTERED','Visible in the inbox');
  PERFORM pg_temp.assert_true((prepare_whatsapp_priced_outbox(job.id,job.lease_token,'Never send',false,p->>'key')->>'status')='CANCELLED','Restricted sender also blocked in outbox');
  BEGIN
    PERFORM link_whatsapp_customer(f.org,f.reader,f.chat_c,f.unlinked,NULL);
    RAISE EXCEPTION 'UNAUTHORIZED_LINK';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.assert_true(link_whatsapp_customer(f.org,f.actor,f.chat_c,f.unlinked,NULL)=f.unlinked,'Link existing active customer without phone');
  PERFORM pg_temp.assert_true(whatsapp_job_pricing(job.id,job.lease_token)->>'reason'='LINKED_AFTER_MESSAGE','Link does not replay the old message');

  UPDATE agent_jobs SET status='SUCCEEDED' WHERE id=job.id;
  job := pg_temp.price_job(f.org,f.wi,f.chat_c,'pricing-first-after-link');
  p := whatsapp_job_pricing(job.id,job.lease_token);
  PERFORM pg_temp.assert_true((p->>'listId')::uuid=f.i AND p->>'reason' IS NULL,'First inbound after link uses assigned list');

  job := pg_temp.price_job(f.org,f.wi,f.chat_a,'pricing-active');
  key := whatsapp_job_pricing(job.id,job.lease_token)->>'key';
  INSERT INTO conversation_carts(organization_id,conversation_id,status,quote_snapshot)
    VALUES(f.org,f.chat_a,'QUOTED','{"total":20,"fingerprint":"old"}') RETURNING id INTO cart;
  UPDATE whatsapp_conversations SET pending_order_action='{"kind":"CONFIRM_PRE_SALE"}' WHERE id=f.chat_a;
  p := prepare_whatsapp_priced_outbox(job.id,job.lease_token,'Precio I',false,key);
  PERFORM pg_temp.assert_true(p->>'status'='SENDING','Current pricing can reserve');
  UPDATE customers SET sales_price_list_id=f.z WHERE id=f.a;
  PERFORM pg_temp.assert_true(guard_whatsapp_priced_dispatch(job.source_message_id,job.lease_token) IS NULL,'Old price rejected immediately before dispatch');
  PERFORM pg_temp.assert_true((SELECT status='CANCELLED' FROM whatsapp_outbox WHERE source_message_id=job.source_message_id),'Stale reservation cancelled');
  PERFORM pg_temp.assert_true((whatsapp_job_pricing(job.id,job.lease_token)->>'listId')::uuid=f.z,'Current context now uses Z');
  PERFORM pg_temp.assert_true((SELECT status='OPEN' AND quote_snapshot IS NULL AND version=2 FROM conversation_carts WHERE id=cart)
    AND (SELECT pending_order_action IS NULL FROM whatsapp_conversations WHERE id=f.chat_a),'List change invalidates quote and confirmation');
  BEGIN
    PERFORM mutate_whatsapp_priced_order(job.id,job.lease_token,key,f.org,f.wi,f.chat_a,job.source_message_id,'CONVERT',cart,1,'{}');
    RAISE EXCEPTION 'STALE_CONTEXT_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='STALE_CONTEXT_ACCEPTED' THEN RAISE; END IF; END;
END $$;

CREATE FUNCTION run_whatsapp_pricing_concurrent_create() RETURNS void LANGUAGE plpgsql AS $$
DECLARE f pricing_fixture%ROWTYPE; BEGIN
  SELECT * INTO f FROM pricing_fixture;
  PERFORM link_whatsapp_customer(f.org,f.actor,f.race_chat,NULL,
    jsonb_build_object('business_name','Alta por WhatsApp','sales_price_list_id',f.i,'customer_channel','DISTRIBUIDORA'));
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'Ya existe un cliente con este número. Usá Vincular cliente.' THEN RAISE; END IF;
END $$;
SELECT 'WhatsApp customer pricing checks passed';
