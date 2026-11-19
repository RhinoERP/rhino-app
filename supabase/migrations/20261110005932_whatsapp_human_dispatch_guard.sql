CREATE OR REPLACE FUNCTION public.guard_whatsapp_human_dispatch(
  p_command_id uuid,p_lease_token uuid,p_phone_number_id text,p_recipient text
) RETURNS timestamptz LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  c public.whatsapp_conversations%ROWTYPE;
  x public.whatsapp_outbox%ROWTYPE;
  wi public.whatsapp_integrations%ROWTYPE;
  deadline timestamptz;
  reason text;
BEGIN
  -- Match the control and completion lock order. The transaction ends before HTTP.
  SELECT conv.* INTO c FROM public.whatsapp_conversations conv
    JOIN public.whatsapp_outbox q ON (q.conversation_id,q.organization_id,q.integration_id)
      =(conv.id,conv.organization_id,conv.integration_id)
    WHERE q.id=p_command_id AND q.origin='HUMAN' FOR UPDATE OF conv;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO x FROM public.whatsapp_outbox WHERE id=p_command_id FOR UPDATE;
  IF NOT FOUND OR x.status<>'SENDING' OR p_lease_token IS NULL
    OR x.lease_token IS DISTINCT FROM p_lease_token OR x.lease_expires_at IS NULL
    OR x.lease_expires_at<=clock_timestamp() THEN RETURN NULL; END IF;

  SELECT * INTO wi FROM public.whatsapp_integrations
    WHERE id=c.integration_id AND organization_id=c.organization_id;
  deadline:=c.last_customer_message_at+interval '24 hours';
  reason:=CASE
    WHEN wi.status IS DISTINCT FROM 'ACTIVE' OR wi.phone_number_id LIKE 'rhinos-local-simulator:%'
      OR wi.phone_number_id IS DISTINCT FROM p_phone_number_id OR c.customer_phone IS DISTINCT FROM p_recipient
      OR NOT public.is_whatsapp_mode_enabled(c.organization_id,wi.phone_number_id) THEN 'CHANNEL_UNAVAILABLE'
    WHEN NOT public.whatsapp_actor_can_manage(c.organization_id,x.actor_user_id) THEN 'ACCESS_REVOKED'
    WHEN c.status<>'HANDOFF' OR c.human_claimed_at IS NULL OR c.assigned_user_id IS DISTINCT FROM x.actor_user_id
      OR c.control_version IS DISTINCT FROM x.control_version THEN 'CONTROL_CONFLICT'
    WHEN deadline IS NULL OR deadline<=clock_timestamp() THEN 'WINDOW_EXPIRED'
  END;
  IF reason IS NOT NULL THEN
    UPDATE public.whatsapp_outbox SET status='CANCELLED',reason_code=reason,updated_at=clock_timestamp() WHERE id=x.id;
    RETURN NULL;
  END IF;
  RETURN deadline;
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_guarded_dispatch_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT public.whatsapp_human_outbox_protocol_version()=1 AND (
    SELECT count(*)=3 AND bool_and(has_function_privilege('service_role',oid,'EXECUTE')
      AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE'))
    FROM pg_proc WHERE oid IN (
      to_regprocedure('public.reserve_whatsapp_human_dispatch()'),
      to_regprocedure('public.guard_whatsapp_human_dispatch(uuid,uuid,text,text)'),
      to_regprocedure('public.whatsapp_guarded_dispatch_ready()')
    )
  )
$$;

-- Keep the original reservation RPC for older workers.
CREATE OR REPLACE FUNCTION public.reserve_whatsapp_human_dispatch()
RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT public.claim_whatsapp_human_outbox() WHERE public.whatsapp_guarded_dispatch_ready()
$$;

REVOKE ALL ON FUNCTION public.reserve_whatsapp_human_dispatch(),
  public.guard_whatsapp_human_dispatch(uuid,uuid,text,text),public.whatsapp_guarded_dispatch_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_whatsapp_human_dispatch(),
  public.guard_whatsapp_human_dispatch(uuid,uuid,text,text),public.whatsapp_guarded_dispatch_ready() TO service_role;
NOTIFY pgrst, 'reload schema';
