-- Keep the worker RPC signature and stored statuses compatible with the previous release.
-- WINDOW_EXPIRED is a terminal result for a human send that never reached acceptance.
CREATE OR REPLACE FUNCTION public.complete_whatsapp_command(p_command_id uuid,p_lease_token uuid,p_status text,p_external_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE x public.whatsapp_outbox%ROWTYPE; c public.whatsapp_conversations%ROWTYPE; existing public.whatsapp_messages%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('PENDING','SENT','UNKNOWN','CANCELLED','WINDOW_EXPIRED') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  SELECT conv.* INTO c FROM public.whatsapp_conversations conv JOIN public.whatsapp_outbox q ON q.conversation_id=conv.id
    AND q.organization_id=conv.organization_id WHERE q.id=p_command_id FOR UPDATE OF conv;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE id=p_command_id FOR UPDATE;
  IF x.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN RETURN false; END IF;
  IF x.status='SENT' THEN RETURN p_status='SENT' AND x.external_message_id IS NOT DISTINCT FROM p_external_message_id; END IF;
  IF x.status='CANCELLED' AND x.reason_code='WINDOW_EXPIRED' THEN
    RETURN p_status='WINDOW_EXPIRED' AND p_external_message_id IS NULL;
  END IF;
  IF x.status NOT IN ('SENDING','UNKNOWN') OR (x.status='UNKNOWN' AND p_status='PENDING') THEN RETURN false; END IF;
  IF p_status='WINDOW_EXPIRED' AND (x.origin<>'HUMAN' OR p_external_message_id IS NOT NULL) THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Resultado de ventana inválido';
  END IF;
  IF p_status='SENT' THEN
    IF coalesce(btrim(p_external_message_id),'')='' THEN RAISE EXCEPTION 'Falta identificador externo'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(x.integration_id::text||p_external_message_id,0));
    SELECT * INTO existing FROM public.whatsapp_messages WHERE external_message_id=p_external_message_id;
    IF FOUND AND (existing.organization_id,existing.conversation_id,existing.integration_id,existing.direction,existing.content)
      IS DISTINCT FROM (x.organization_id,x.conversation_id,x.integration_id,'OUTBOUND'::text,x.text) THEN
      RAISE EXCEPTION 'Identificador externo ya registrado'; END IF;
    INSERT INTO public.whatsapp_messages(organization_id,integration_id,conversation_id,external_message_id,direction,message_type,content,payload,delivery_status,sent_at,origin,sender_user_id)
      VALUES(x.organization_id,x.integration_id,x.conversation_id,p_external_message_id,'OUTBOUND','TEXT',x.text,
        jsonb_build_object('provider','META_CLOUD','sourceMessageId',x.source_message_id,'orderPrompt',x.order_prompt),'SENT',clock_timestamp(),x.origin,x.actor_user_id)
      ON CONFLICT(external_message_id) DO NOTHING;
    UPDATE public.whatsapp_conversations SET last_message_at=greatest(last_message_at,clock_timestamp()) WHERE id=c.id;
  END IF;
  UPDATE public.whatsapp_outbox SET status=CASE WHEN p_status='WINDOW_EXPIRED' THEN 'CANCELLED' ELSE p_status END,
    external_message_id=coalesce(p_external_message_id,external_message_id),updated_at=clock_timestamp(),
    reason_code=CASE p_status WHEN 'UNKNOWN' THEN 'DELIVERY_UNKNOWN' WHEN 'WINDOW_EXPIRED' THEN 'WINDOW_EXPIRED' WHEN 'CANCELLED' THEN 'PROVIDER_REJECTED' ELSE NULL END,
    available_at=CASE WHEN p_status='PENDING' THEN clock_timestamp()+make_interval(secs=>least(300,5*(2^attempts)::integer)) ELSE available_at END
    WHERE id=x.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_whatsapp_command(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_command(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
