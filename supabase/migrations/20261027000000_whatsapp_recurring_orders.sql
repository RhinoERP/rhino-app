-- Pause the daemon while installing this migration and deploying the matching app.
ALTER TABLE public.conversation_carts
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quote_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS last_source_message_id uuid REFERENCES public.whatsapp_messages(id);
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS pending_order_action jsonb,
  ADD COLUMN IF NOT EXISTS automation_resumed_at timestamptz;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS whatsapp_cart_id uuid;

-- Refuse an ambiguous backfill instead of silently relinking historical orders.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales_orders s
    LEFT JOIN public.conversation_carts c ON c.conversation_id=s.conversation_id AND c.organization_id=s.organization_id
    WHERE s.source='WHATSAPP' AND s.conversation_id IS NOT NULL AND s.whatsapp_cart_id IS NULL
    GROUP BY s.id HAVING count(c.id) <> 1
  ) THEN RAISE EXCEPTION 'WhatsApp recurring orders: inconsistent historical cart/order links'; END IF;
END $$;
UPDATE public.sales_orders s SET whatsapp_cart_id=c.id
FROM public.conversation_carts c
WHERE s.source='WHATSAPP' AND s.whatsapp_cart_id IS NULL
AND c.conversation_id=s.conversation_id AND c.organization_id=s.organization_id;
UPDATE public.conversation_carts c SET status='CONVERTED', confirmed_at=coalesce(c.confirmed_at,s.created_at,now())
FROM public.sales_orders s WHERE s.whatsapp_cart_id=c.id AND c.status <> 'CONVERTED';
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_whatsapp_cart_fkey;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_whatsapp_cart_fkey
  FOREIGN KEY (whatsapp_cart_id,organization_id) REFERENCES public.conversation_carts(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_whatsapp_cart_unique ON public.sales_orders(whatsapp_cart_id) WHERE whatsapp_cart_id IS NOT NULL;
DROP INDEX IF EXISTS public.sales_orders_whatsapp_conversation_unique;
ALTER TABLE public.conversation_carts DROP CONSTRAINT IF EXISTS conversation_carts_conversation_key;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_carts_one_pending ON public.conversation_carts(conversation_id)
WHERE status IN ('OPEN','QUOTED','CONFIRMED');

-- Service-only, transactional state machine. All writes lock the conversation;
-- versions protect against stale tools even when several HTTP requests overlap.
CREATE OR REPLACE FUNCTION public.mutate_whatsapp_order(
  p_organization_id uuid, p_integration_id uuid, p_conversation_id uuid,
  p_source_message_id uuid, p_operation text, p_cart_id uuid DEFAULT NULL,
  p_version integer DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  wc public.whatsapp_conversations%ROWTYPE;
  wi public.whatsapp_integrations%ROWTYPE;
  src public.whatsapp_messages%ROWTYPE;
  cart public.conversation_carts%ROWTYPE;
  action jsonb;
  item jsonb;
  sale_id uuid;
  columns_sql text;
  table_name text;
  rows_json jsonb;
BEGIN
  SELECT * INTO wc FROM public.whatsapp_conversations WHERE id=p_conversation_id
    AND organization_id=p_organization_id AND integration_id=p_integration_id FOR UPDATE;
  SELECT * INTO wi FROM public.whatsapp_integrations WHERE id=p_integration_id AND organization_id=p_organization_id;
  IF wc.id IS NULL OR wc.status <> 'ACTIVE' OR wi.id IS NULL
     OR NOT public.is_whatsapp_mode_enabled(p_organization_id,wi.phone_number_id)
     OR (wi.phone_number_id LIKE 'rhinos-local-simulator:%' AND wi.status <> 'DRAFT')
     OR (wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%' AND wi.status <> 'ACTIVE') THEN
    RAISE EXCEPTION 'Conversation unavailable for automation';
  END IF;
  SELECT * INTO src FROM public.whatsapp_messages WHERE id=p_source_message_id
    AND conversation_id=wc.id AND organization_id=p_organization_id AND integration_id=p_integration_id AND direction='INBOUND';
  IF src.id IS NULL OR (wc.automation_resumed_at IS NOT NULL AND src.created_at <= wc.automation_resumed_at)
     OR EXISTS (SELECT 1 FROM public.whatsapp_messages m WHERE m.conversation_id=wc.id AND m.direction='INBOUND'
       AND (m.created_at,m.id) > (src.created_at,src.id)) THEN
    RAISE EXCEPTION 'Stale source message; reload the conversation';
  END IF;
  action := wc.pending_order_action;
  IF p_cart_id IS NOT NULL THEN
    SELECT * INTO cart FROM public.conversation_carts WHERE id=p_cart_id AND conversation_id=wc.id AND organization_id=p_organization_id FOR UPDATE;
    -- A retry of a committed conversion returns the same complete sale.
    IF p_operation='CONVERT' THEN
      SELECT id INTO sale_id FROM public.sales_orders WHERE whatsapp_cart_id=cart.id AND organization_id=p_organization_id;
      IF sale_id IS NOT NULL THEN RETURN jsonb_build_object('preSaleId',sale_id,'alreadyCreated',true); END IF;
    END IF;
    IF cart.id IS NULL OR cart.version IS DISTINCT FROM p_version OR cart.status NOT IN ('OPEN','QUOTED','CONFIRMED') THEN
      RAISE EXCEPTION 'Stale or completed cart; reload the commercial state';
    END IF;
  END IF;
  IF p_operation='REQUEST_NEW' THEN
    IF EXISTS(SELECT 1 FROM conversation_carts WHERE conversation_id=wc.id AND status IN ('OPEN','QUOTED','CONFIRMED')) THEN RAISE EXCEPTION 'An order is already pending'; END IF;
    UPDATE public.whatsapp_conversations SET pending_order_action=jsonb_build_object('kind','START_ORDER','sourceMessageId',src.id) WHERE id=wc.id;
  ELSIF p_operation='START' THEN
    IF coalesce((p_payload->>'confirmStart')::boolean,false) AND (
      action->>'kind' IS DISTINCT FROM 'START_ORDER' OR public.whatsapp_is_explicit_confirmation(src.content) IS NOT TRUE
      OR NOT EXISTS(SELECT 1 FROM whatsapp_messages m WHERE m.id=(action->>'promptMessageId')::uuid AND m.conversation_id=wc.id
        AND m.direction='OUTBOUND' AND (m.created_at,m.id)<(src.created_at,src.id)
        AND NOT EXISTS(SELECT 1 FROM whatsapp_messages later WHERE later.conversation_id=wc.id AND later.direction='OUTBOUND'
          AND (later.created_at,later.id)>(m.created_at,m.id) AND (later.created_at,later.id)<(src.created_at,src.id)))) THEN
      RAISE EXCEPTION 'A new order requires a purchase request or confirmation of its question';
    END IF;
    SELECT * INTO cart FROM public.conversation_carts WHERE conversation_id=wc.id AND status IN ('OPEN','QUOTED','CONFIRMED');
    IF cart.id IS NULL THEN
      INSERT INTO public.conversation_carts(organization_id,conversation_id,last_source_message_id)
      VALUES(p_organization_id,wc.id,src.id) RETURNING * INTO cart;
      IF action->>'kind'='START_ORDER' THEN UPDATE whatsapp_conversations SET pending_order_action=NULL WHERE id=wc.id; END IF;
    END IF;
  ELSIF p_operation='UPSERT' THEN
    IF EXISTS (SELECT 1 FROM public.product_variants v WHERE v.id=(p_payload->>'product_variant_id')::uuid AND v.product_id<>(p_payload->>'product_id')::uuid)
      OR ((p_payload->>'product_variant_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.id=(p_payload->>'product_variant_id')::uuid)) THEN
      RAISE EXCEPTION 'Invalid product variant';
    END IF;
    DELETE FROM public.conversation_cart_items WHERE cart_id=cart.id AND product_id=(p_payload->>'product_id')::uuid
      AND product_variant_id IS NOT DISTINCT FROM (p_payload->>'product_variant_id')::uuid;
    INSERT INTO public.conversation_cart_items(organization_id,cart_id,product_id,product_variant_id,quantity,unit_price,price_snapshot)
    VALUES(p_organization_id,cart.id,(p_payload->>'product_id')::uuid,(p_payload->>'product_variant_id')::uuid,
      (p_payload->>'quantity')::numeric,(p_payload->>'unit_price')::numeric,p_payload->'price_snapshot');
    UPDATE public.conversation_carts SET status='OPEN',version=version+1,quoted_at=NULL,quote_snapshot=NULL,last_source_message_id=src.id WHERE id=cart.id RETURNING * INTO cart;
    UPDATE public.whatsapp_conversations SET pending_order_action=NULL WHERE id=wc.id;
  ELSIF p_operation='REMOVE' THEN
    DELETE FROM public.conversation_cart_items WHERE cart_id=cart.id AND id=(p_payload->>'item_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cart item not found'; END IF;
    UPDATE public.conversation_carts SET status='OPEN',version=version+1,quoted_at=NULL,quote_snapshot=NULL,last_source_message_id=src.id WHERE id=cart.id RETURNING * INTO cart;
    UPDATE public.whatsapp_conversations SET pending_order_action=NULL WHERE id=wc.id;
  ELSIF p_operation='QUOTE' THEN
    IF action->>'kind'='REVIEW_REPEAT' THEN RAISE EXCEPTION 'Repeated-order changes require explicit review'; END IF;
    IF jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'Empty cart'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
      UPDATE public.conversation_cart_items SET unit_price=(item->>'unit_price')::numeric,price_snapshot=item->'price_snapshot'
      WHERE id=(item->>'id')::uuid AND cart_id=cart.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cart item changed'; END IF;
    END LOOP;
    UPDATE public.conversation_carts SET status='QUOTED',version=version+1,quoted_at=now(),quote_snapshot=p_payload->'snapshot',last_source_message_id=src.id WHERE id=cart.id RETURNING * INTO cart;
    UPDATE public.whatsapp_conversations SET pending_order_action=jsonb_build_object('kind','CONFIRM_PRE_SALE','cartId',cart.id,'version',cart.version,'sourceMessageId',src.id) WHERE id=wc.id;
  ELSIF p_operation='REQUEST_REPEAT_REVIEW' THEN
    UPDATE public.whatsapp_conversations SET pending_order_action=jsonb_build_object('kind','REVIEW_REPEAT','cartId',cart.id,'version',cart.version,'sourceMessageId',src.id,'differences',p_payload->'differences') WHERE id=wc.id;
  ELSIF p_operation='REQUEST_SELECTION' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'orders') offered WHERE NOT EXISTS (
      SELECT 1 FROM sales_orders s WHERE s.id=(offered->>'id')::uuid AND s.conversation_id=wc.id AND s.organization_id=p_organization_id)) THEN RAISE EXCEPTION 'Invalid order selection'; END IF;
    UPDATE public.whatsapp_conversations SET pending_order_action=jsonb_build_object('kind','SELECT_PRE_SALE','sourceMessageId',src.id,'orders',p_payload->'orders','purpose',p_payload->>'purpose') WHERE id=wc.id;
  ELSIF p_operation='SELECT_ORDER' THEN
    IF action->>'kind'<>'SELECT_PRE_SALE' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(action->'orders') offered WHERE offered->>'id'=p_payload->>'pre_sale_id') THEN RAISE EXCEPTION 'Invalid order selection'; END IF;
    UPDATE public.whatsapp_conversations SET pending_order_action=jsonb_build_object('kind','SELECTED_PRE_SALE','preSaleId',p_payload->>'pre_sale_id','purpose',action->>'purpose','sourceMessageId',src.id) WHERE id=wc.id;
  ELSIF p_operation='CANCEL_ACTION' THEN
    UPDATE public.whatsapp_conversations SET pending_order_action=NULL WHERE id=wc.id;
  ELSIF p_operation='REQUEST_ABANDON' THEN
    UPDATE public.whatsapp_conversations SET pending_order_action=jsonb_build_object('kind',CASE WHEN coalesce((p_payload->>'replace')::boolean,false) THEN 'REPLACE_CART' ELSE 'ABANDON_CART' END,'cartId',cart.id,'version',cart.version,'sourceMessageId',src.id,'repeatPreSaleId',p_payload->>'repeatPreSaleId') WHERE id=wc.id;
  ELSIF p_operation IN ('ABANDON','CONVERT','ACCEPT_REPEAT') THEN
    IF action->>'cartId' IS DISTINCT FROM cart.id::text OR (action->>'version')::integer IS DISTINCT FROM cart.version
      OR (action->>'promptMessageId') IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.whatsapp_messages m WHERE m.id=(action->>'promptMessageId')::uuid AND m.conversation_id=wc.id
        AND m.direction='OUTBOUND' AND (m.created_at,m.id)<(src.created_at,src.id)
        AND NOT EXISTS(SELECT 1 FROM public.whatsapp_messages later WHERE later.conversation_id=wc.id AND later.direction='OUTBOUND'
          AND (later.created_at,later.id)>(m.created_at,m.id) AND (later.created_at,later.id)<(src.created_at,src.id)))
      OR public.whatsapp_is_explicit_confirmation(src.content) IS NOT TRUE THEN
      RAISE EXCEPTION 'No explicit confirmation for this action and cart version';
    END IF;
    IF p_operation='ACCEPT_REPEAT' THEN
      IF action->>'kind'<>'REVIEW_REPEAT' THEN RAISE EXCEPTION 'Wrong pending action'; END IF;
      UPDATE public.conversation_carts SET version=version+1,last_source_message_id=src.id WHERE id=cart.id RETURNING * INTO cart;
      UPDATE public.whatsapp_conversations SET pending_order_action=NULL WHERE id=wc.id;
    ELSIF p_operation='ABANDON' THEN
      IF action->>'kind' NOT IN ('ABANDON_CART','REPLACE_CART') THEN RAISE EXCEPTION 'Wrong pending action'; END IF;
      UPDATE public.conversation_carts SET status='ABANDONED',version=version+1,last_source_message_id=src.id WHERE id=cart.id RETURNING * INTO cart;
      IF action->>'kind'='REPLACE_CART' THEN
        INSERT INTO public.conversation_carts(organization_id,conversation_id,last_source_message_id) VALUES(p_organization_id,wc.id,src.id) RETURNING * INTO cart;
      END IF;
      UPDATE public.whatsapp_conversations SET pending_order_action=CASE WHEN action->>'kind'='REPLACE_CART' AND action->>'repeatPreSaleId' IS NOT NULL
        THEN jsonb_build_object('kind','REPEAT_READY','preSaleId',action->>'repeatPreSaleId','cartId',cart.id,'sourceMessageId',src.id) ELSE NULL END WHERE id=wc.id;
    ELSE
      IF action->>'kind'<>'CONFIRM_PRE_SALE' OR cart.status<>'QUOTED' THEN RAISE EXCEPTION 'Cart must be quoted'; END IF;
      IF p_payload->'fingerprint' IS DISTINCT FROM cart.quote_snapshot->'fingerprint' OR p_payload->'order'->'total_amount' IS DISTINCT FROM cart.quote_snapshot->'total' THEN RAISE EXCEPTION 'Quote changed; request a new confirmation'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id=(p_payload->'order'->>'customer_id')::uuid AND organization_id=p_organization_id)
        OR NOT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id=(p_payload->'order'->>'user_id')::uuid AND organization_id=p_organization_id AND is_active) THEN RAISE EXCEPTION 'Invalid customer or seller'; END IF;
      sale_id := (p_payload->'order'->>'id')::uuid;
      -- Insert only explicitly prepared columns so database defaults remain intact.
      FOR table_name, rows_json IN SELECT * FROM (VALUES
        ('sales_orders',jsonb_build_array((p_payload->'order') || jsonb_build_object('source','WHATSAPP','status','DRAFT','organization_id',p_organization_id,'conversation_id',wc.id,'whatsapp_cart_id',cart.id))),
        ('sales_order_items',p_payload->'items'),('sales_order_item_taxes',p_payload->'itemTaxes'),('sales_order_taxes',p_payload->'taxes')) AS payloads(t,r)
      LOOP
        FOR item IN SELECT value FROM jsonb_array_elements(rows_json) LOOP
          -- These records are generated by the service, never by model arguments.
          IF table_name <> 'sales_orders' THEN item := item || jsonb_build_object('organization_id',p_organization_id,'sales_order_id',sale_id); END IF;
          SELECT string_agg(format('%I',key),',' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(item) AS keys(key);
          EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)',table_name,columns_sql,columns_sql,table_name) USING item;
        END LOOP;
      END LOOP;
      UPDATE public.conversation_carts SET status='CONVERTED',confirmed_at=now(),last_source_message_id=src.id WHERE id=cart.id;
      UPDATE public.whatsapp_conversations SET current_pre_sale_id=sale_id,pending_order_action=NULL WHERE id=wc.id;
      RETURN jsonb_build_object('preSaleId',sale_id,'alreadyCreated',false);
    END IF;
  ELSE RAISE EXCEPTION 'Unknown order operation'; END IF;
  RETURN to_jsonb(cart);
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_is_explicit_confirmation(value text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT translate(lower(trim(coalesce(value,''))),'áéíóú','aeiou') ~ '^(si(,? confirmo)?|confirmo|confirmar|acepto|dale(,? avancemos)?|ok|okay|procedamos|avancemos|lo quiero|quiero comprar|de acuerdo)[!. ]*$';
$$;

-- Bind the actual delivered quote/question, not an earlier unrelated assistant message.
CREATE OR REPLACE FUNCTION public.bind_whatsapp_order_prompt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  IF NEW.direction='OUTBOUND' AND NEW.payload->>'orderPrompt'='true' THEN
    UPDATE public.whatsapp_conversations SET pending_order_action=pending_order_action || jsonb_build_object('promptMessageId',NEW.id)
    WHERE id=NEW.conversation_id AND organization_id=NEW.organization_id
      AND pending_order_action->>'sourceMessageId'=NEW.payload->>'sourceMessageId'
      AND (pending_order_action->>'promptMessageId') IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bind_whatsapp_order_prompt ON public.whatsapp_messages;
CREATE TRIGGER bind_whatsapp_order_prompt AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.bind_whatsapp_order_prompt();
REVOKE ALL ON FUNCTION public.mutate_whatsapp_order(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_whatsapp_order(uuid,uuid,uuid,uuid,text,uuid,integer,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.bind_whatsapp_order_prompt() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_whatsapp_automation(p_organization_id uuid,p_conversation_id uuid,p_enabled boolean,p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wc public.whatsapp_conversations%ROWTYPE;
BEGIN
 SELECT * INTO wc FROM public.whatsapp_conversations WHERE id=p_conversation_id AND organization_id=p_organization_id FOR UPDATE;
 IF wc.id IS NULL OR wc.status NOT IN ('ACTIVE','PAUSED','HANDOFF') THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_organization_id AND user_id=p_actor_id AND is_active) THEN RAISE EXCEPTION 'Invalid actor'; END IF;
 UPDATE public.whatsapp_conversations SET status=CASE WHEN p_enabled THEN 'ACTIVE' ELSE 'PAUSED' END,
   bot_paused_at=CASE WHEN p_enabled THEN NULL ELSE now() END,
   bot_paused_by=CASE WHEN p_enabled THEN NULL ELSE p_actor_id END,
   handoff_reason=CASE WHEN p_enabled THEN NULL ELSE handoff_reason END,
   automation_resumed_at=CASE WHEN p_enabled AND wc.status<>'ACTIVE' THEN clock_timestamp() ELSE automation_resumed_at END,
   pending_order_action=NULL WHERE id=wc.id;
END $$;
REVOKE ALL ON FUNCTION public.set_whatsapp_automation(uuid,uuid,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_automation(uuid,uuid,boolean,uuid) TO service_role;

-- Only one live worker job per conversation; expired leases remain recoverable.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_agent_job(p_worker_id text)
RETURNS SETOF public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.agent_jobs%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_worker_id), '') = '' THEN
    RAISE EXCEPTION 'El identificador del worker es obligatorio';
  END IF;

  SELECT j.* INTO v_job
  FROM public.agent_jobs j
  JOIN public.whatsapp_integrations wi ON wi.id = j.integration_id
  JOIN public.whatsapp_conversations wc ON wc.id = j.conversation_id
  WHERE (
      (j.status IN ('PENDING', 'RETRY') AND j.available_at <= now())
      OR (j.status = 'PROCESSING' AND j.locked_at < now() - interval '15 minutes')
    )
    AND wi.status = 'ACTIVE'
    AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    AND public.is_whatsapp_mode_enabled(wi.organization_id, wi.phone_number_id)
    AND wc.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM public.agent_jobs busy WHERE busy.conversation_id=j.conversation_id
      AND busy.id<>j.id AND busy.status='PROCESSING' AND busy.locked_at>=now()-interval '15 minutes')
  ORDER BY j.available_at, j.created_at
  FOR UPDATE OF j, wc SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.agent_jobs
  SET status = 'PROCESSING',
      attempts = v_job.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      last_error = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN NEXT v_job;
END;
$$;

