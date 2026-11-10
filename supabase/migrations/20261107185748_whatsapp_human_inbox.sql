-- Read models for the inbox. The browser uses scoped server endpoints.
-- The ERP notification migrations must already be present.
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE public.notifications SET is_read = true, read_at = now()
  WHERE id = p_id AND user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
-- Generic notification creation can target another tenant and is only called by services.
REVOKE ALL ON FUNCTION public.get_users_by_permission(uuid,text),
  public.notify_users_by_permission(uuid,text,text,text,text,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_permission(uuid,text),
  public.notify_users_by_permission(uuid,text,text,text,text,jsonb,text,uuid) TO service_role;


ALTER TABLE public.whatsapp_conversations ADD COLUMN IF NOT EXISTS inbox_clock timestamptz;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS inbox_at timestamptz;
ALTER TABLE public.whatsapp_conversation_events ADD COLUMN IF NOT EXISTS inbox_at timestamptz;

-- Assign the synchronization timestamp under the same lock as message ingestion
-- and control. Provider dates and timestamps set by callers remain display-only.
CREATE OR REPLACE FUNCTION public.stamp_whatsapp_inbox_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.whatsapp_conversations
  SET inbox_clock = greatest(clock_timestamp(), inbox_clock + interval '1 microsecond')
  WHERE id = NEW.conversation_id AND organization_id = NEW.organization_id
  RETURNING inbox_clock INTO NEW.inbox_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_whatsapp_inbox_stamp ON public.whatsapp_messages;
CREATE TRIGGER zz_whatsapp_inbox_stamp BEFORE INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_whatsapp_inbox_item();
DROP TRIGGER IF EXISTS zz_whatsapp_inbox_stamp ON public.whatsapp_conversation_events;
CREATE TRIGGER zz_whatsapp_inbox_stamp BEFORE INSERT ON public.whatsapp_conversation_events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_whatsapp_inbox_item();

CREATE INDEX IF NOT EXISTS whatsapp_inbox_message_cursor_idx ON public.whatsapp_messages
  (conversation_id, (coalesce(inbox_at, created_at)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS whatsapp_inbox_inbound_cursor_idx ON public.whatsapp_messages
  (conversation_id, (coalesce(inbox_at, created_at)) DESC, id DESC) WHERE direction = 'INBOUND';
CREATE INDEX IF NOT EXISTS whatsapp_inbox_event_cursor_idx ON public.whatsapp_conversation_events
  (conversation_id, (coalesce(inbox_at, created_at)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS whatsapp_inbox_list_cursor_idx ON public.whatsapp_conversations
  (organization_id, (coalesce(last_message_at, created_at)) DESC, id DESC);
CREATE INDEX IF NOT EXISTS whatsapp_inbox_attention_idx ON public.whatsapp_conversations
  (organization_id, integration_id) WHERE status = 'HANDOFF' AND human_claimed_at IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_inbox_commands_idx ON public.whatsapp_outbox
  (conversation_id, created_at DESC, id DESC) WHERE origin = 'HUMAN' OR status = 'UNKNOWN';

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_reads (
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_at timestamptz NOT NULL,
  message_id uuid NOT NULL,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.whatsapp_conversations(id, organization_id) ON DELETE CASCADE
);
ALTER TABLE public.whatsapp_conversation_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_conversation_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_conversation_reads TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_actor_can_read(p_org uuid, p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = p_org AND m.user_id = p_actor AND m.is_active
      AND o.is_active AND o.whatsapp_enabled
      AND (m.is_owner OR EXISTS (
        SELECT 1 FROM public.roles r
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE r.id = m.role_id AND r.organization_id = m.organization_id
          AND p.key IN ('whatsapp.read', 'organization.admin')
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_conversation(p_org uuid, p_actor uuid, p_chat uuid)
RETURNS public.whatsapp_conversations LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c public.whatsapp_conversations;
BEGIN
  IF public.whatsapp_actor_can_read(p_org, p_actor) THEN
    SELECT wc.* INTO c FROM public.whatsapp_conversations wc
    JOIN public.whatsapp_integrations wi ON (wi.id, wi.organization_id) = (wc.integration_id, wc.organization_id)
    WHERE wc.organization_id = p_org AND wc.id = p_chat
      AND public.is_whatsapp_mode_enabled(p_org, wi.phone_number_id);
  END IF;
  IF c.id IS NULL THEN RAISE SQLSTATE '42501' USING MESSAGE = 'Conversación no disponible'; END IF;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.list_whatsapp_inbox(
  p_org uuid, p_actor uuid, p_filter text, p_search text, p_at timestamptz DEFAULT NULL, p_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.whatsapp_actor_can_read(p_org, p_actor) OR (p_filter = 'simulation' AND NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org AND whatsapp_sandbox_enabled
  )) THEN RAISE SQLSTATE '42501' USING MESSAGE = 'WhatsApp no disponible'; END IF;
  RETURN jsonb_build_object(
    'attentionCount', (
      SELECT count(*) FROM public.whatsapp_conversations c
      JOIN public.whatsapp_integrations wi ON (wi.id, wi.organization_id) = (c.integration_id, c.organization_id)
      WHERE c.organization_id = p_org AND c.status = 'HANDOFF' AND c.human_claimed_at IS NULL
        AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    ),
    'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'at', c.activity_at, 'lastMessageAt', c.last_message_at,
      'customerPhone', c.customer_phone, 'customerName', c.customer_name, 'status', c.status,
      'assignedUserId', c.assigned_user_id, 'assignedName', nullif(assignee.raw_user_meta_data->>'full_name',''),
      'humanClaimedAt', c.human_claimed_at,
      'preview', msg.preview, 'unread', unread.total
    ) ORDER BY c.activity_at DESC, c.id DESC), '[]')
    FROM (
      SELECT c.*, coalesce(c.last_message_at, c.created_at) AS activity_at,
        coalesce(nullif(cu.fantasy_name, ''), cu.business_name) AS customer_name
      FROM public.whatsapp_conversations c
      JOIN public.whatsapp_integrations wi ON (wi.id, wi.organization_id) = (c.integration_id, c.organization_id)
      LEFT JOIN public.customers cu ON (cu.id, cu.organization_id) = (c.customer_id, c.organization_id)
      WHERE c.organization_id = p_org
        AND (wi.phone_number_id LIKE 'rhinos-local-simulator:%') = (p_filter = 'simulation')
        AND CASE p_filter WHEN 'attention' THEN c.status = 'HANDOFF' AND c.human_claimed_at IS NULL
          WHEN 'mine' THEN c.assigned_user_id = p_actor AND c.status = 'HANDOFF'
          WHEN 'agent' THEN c.status = 'ACTIVE' ELSE true END
        AND (p_search = '' OR strpos(lower(concat_ws(' ', c.customer_phone, cu.fantasy_name, cu.business_name)), lower(p_search)) > 0)
        AND (p_at IS NULL OR (coalesce(c.last_message_at,c.created_at), c.id) < (p_at, p_id))
      ORDER BY coalesce(c.last_message_at,c.created_at) DESC, c.id DESC LIMIT 31
    ) c
    LEFT JOIN auth.users assignee ON assignee.id = c.assigned_user_id
    LEFT JOIN public.whatsapp_conversation_reads r ON r.conversation_id = c.id AND r.user_id = p_actor
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('direction', m.direction, 'type', m.message_type,
        'content', CASE WHEN m.message_type = 'AUDIO' THEN NULL ELSE left(m.content, 160) END) AS preview
      FROM public.whatsapp_messages m WHERE m.conversation_id = c.id
      ORDER BY coalesce(m.inbox_at,m.created_at) DESC, m.id DESC LIMIT 1
    ) msg ON true
    CROSS JOIN LATERAL (
      SELECT count(*) AS total FROM (
        SELECT 1 FROM public.whatsapp_messages m WHERE m.conversation_id = c.id AND m.direction = 'INBOUND'
          AND (coalesce(m.inbox_at,m.created_at),m.id) > (coalesce(r.message_at,'-infinity'),coalesce(r.message_id,'00000000-0000-0000-0000-000000000000'))
        LIMIT 100
      ) recent
    ) unread)
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_inbox_detail(p_org uuid, p_actor uuid, p_chat uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c public.whatsapp_conversations := public.whatsapp_inbox_conversation(p_org,p_actor,p_chat);
BEGIN
  RETURN public.whatsapp_conversation_control_state(p_org,p_chat) || jsonb_build_object(
    'customerPhone', c.customer_phone,
    'customerName', (SELECT coalesce(nullif(fantasy_name,''),business_name) FROM public.customers
      WHERE id = c.customer_id AND organization_id = p_org),
    'handoffReason', c.handoff_reason, 'windowEndsAt', c.last_customer_message_at + interval '24 hours',
    'isSimulator', wi.phone_number_id LIKE 'rhinos-local-simulator:%',
    'canManage', public.whatsapp_actor_can_manage(p_org,p_actor),
    'audioEnabled', (SELECT CASE WHEN wi.phone_number_id LIKE 'rhinos-local-simulator:%'
      THEN o.whatsapp_sandbox_audio_enabled ELSE o.whatsapp_audio_enabled END FROM public.organizations o WHERE o.id = p_org),
    'canSend', wi.status = 'ACTIVE' AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
      AND public.whatsapp_human_outbox_protocol_version() = 1,
    'operators', public.list_whatsapp_control_operators(p_org),
    'readCursor', (SELECT jsonb_build_object('id',r.message_id,'at',r.message_at)
      FROM public.whatsapp_conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = p_actor),
    'pendingOrder', (SELECT jsonb_build_object('status',cart.status,'createdAt',cart.created_at)
      FROM public.conversation_carts cart WHERE cart.organization_id = p_org AND cart.conversation_id = c.id
        AND cart.status IN ('OPEN','QUOTED','CONFIRMED') ORDER BY cart.created_at DESC LIMIT 1),
    'preSales', (SELECT coalesce(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]')
      FROM (SELECT jsonb_build_object('id',id,'number',sale_number::text,'date',sale_date,'status',status) item, created_at
        FROM public.sales_orders WHERE organization_id = p_org AND conversation_id = c.id AND source = 'WHATSAPP'
        ORDER BY created_at DESC LIMIT 20) s),
    'commands', (SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at,x.id), '[]')
      FROM (
        SELECT jsonb_build_object('id',x.id,'status',x.status,'at',x.created_at,
          'text',CASE WHEN x.origin = 'HUMAN' THEN x.text END,
          'windowExpired',coalesce(x.reason_code = 'WINDOW_EXPIRED',false)) AS item, x.created_at, x.id
        FROM public.whatsapp_outbox x WHERE x.organization_id = p_org AND x.conversation_id = c.id
          AND (x.status = 'UNKNOWN' OR (x.origin = 'HUMAN' AND x.status <> 'SENT'))
        ORDER BY (x.status = 'UNKNOWN') DESC, x.created_at DESC, x.id DESC LIMIT 30
      ) x)
  ) FROM public.whatsapp_integrations wi WHERE (wi.id,wi.organization_id) = (c.integration_id,p_org);
END $$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_inbox_history(
  p_org uuid, p_actor uuid, p_chat uuid, p_at timestamptz DEFAULT NULL, p_id uuid DEFAULT NULL, p_after boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c public.whatsapp_conversations := public.whatsapp_inbox_conversation(p_org,p_actor,p_chat);
  audio_enabled boolean;
BEGIN
  SELECT CASE WHEN wi.phone_number_id LIKE 'rhinos-local-simulator:%'
      THEN o.whatsapp_sandbox_audio_enabled ELSE o.whatsapp_audio_enabled END
    INTO audio_enabled FROM public.organizations o JOIN public.whatsapp_integrations wi ON wi.organization_id=o.id
    WHERE o.id=p_org AND wi.id=c.integration_id;
  RETURN (
    WITH timeline AS NOT MATERIALIZED (
      SELECT m.id, coalesce(m.inbox_at,m.created_at) AS at, false AS event
      FROM public.whatsapp_messages m WHERE m.conversation_id = c.id
      UNION ALL
      SELECT e.id, coalesce(e.inbox_at,e.created_at), true
      FROM public.whatsapp_conversation_events e WHERE e.conversation_id = c.id
    ), page AS (
      (SELECT * FROM timeline WHERE p_after AND (at,id) > (p_at,p_id) ORDER BY at,id LIMIT 51)
      UNION ALL
      (SELECT * FROM timeline WHERE NOT p_after AND (p_at IS NULL OR (at,id) < (p_at,p_id)) ORDER BY at DESC,id DESC LIMIT 51)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id,'at',p.at) ||
      CASE WHEN p.event THEN jsonb_build_object(
        'kind','event','type',e.type,'displayAt',e.created_at,
        'actorName',nullif(actor.raw_user_meta_data->>'full_name','')
      ) ELSE jsonb_build_object(
        'kind','message','type',m.message_type,'displayAt',coalesce(m.sent_at,m.created_at),
        'direction',m.direction,'content',CASE WHEN m.message_type <> 'AUDIO' OR audio_enabled THEN m.content END,
        'origin',m.origin,'senderName',nullif(u.raw_user_meta_data->>'full_name',''),'delivery',m.delivery_status,
        'audioStatus',CASE WHEN audio_enabled THEN a.status END,
        'audioPlayable',coalesce(audio_enabled AND a.stored AND a.purged_at IS NULL AND a.expires_at > statement_timestamp(),false)
      ) END ORDER BY CASE WHEN p_after THEN p.at END, CASE WHEN p_after THEN p.id END, p.at DESC, p.id DESC), '[]')
    FROM page p
    LEFT JOIN public.whatsapp_messages m ON NOT p.event AND m.id = p.id AND m.conversation_id = c.id
    LEFT JOIN public.whatsapp_conversation_events e ON p.event AND e.id = p.id AND e.conversation_id = c.id
    LEFT JOIN auth.users u ON u.id = m.sender_user_id
    LEFT JOIN auth.users actor ON actor.id = e.actor_user_id
    LEFT JOIN public.whatsapp_audio_assets a ON a.message_id = m.id AND a.organization_id = p_org AND a.conversation_id = c.id
  );
END $$;

CREATE OR REPLACE FUNCTION public.mark_whatsapp_inbox_read(p_org uuid, p_actor uuid, p_chat uuid, p_message uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c public.whatsapp_conversations := public.whatsapp_inbox_conversation(p_org,p_actor,p_chat);
BEGIN
  INSERT INTO public.whatsapp_conversation_reads AS r(organization_id,conversation_id,user_id,message_at,message_id)
  SELECT p_org,c.id,p_actor,coalesce(m.inbox_at,m.created_at),m.id FROM public.whatsapp_messages m
  WHERE m.id = p_message AND m.conversation_id = c.id AND m.organization_id = p_org AND m.direction = 'INBOUND'
  ON CONFLICT (conversation_id,user_id) DO UPDATE SET message_at = excluded.message_at,message_id = excluded.message_id
  WHERE (r.message_at,r.message_id) < (excluded.message_at,excluded.message_id);
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_messages WHERE id = p_message AND conversation_id = c.id AND direction = 'INBOUND'
  ) THEN RAISE SQLSTATE '42501' USING MESSAGE = 'Mensaje no disponible'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_inbox_audio(p_org uuid, p_actor uuid, p_chat uuid, p_message uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c public.whatsapp_conversations := public.whatsapp_inbox_conversation(p_org,p_actor,p_chat);
BEGIN
  RETURN (SELECT jsonb_build_object('path',a.storage_path,'mime',a.mime_type)
    FROM public.whatsapp_audio_assets a
    JOIN public.whatsapp_messages m ON m.id = a.message_id AND m.conversation_id = a.conversation_id
    JOIN public.whatsapp_integrations wi ON (wi.id,wi.organization_id) = (a.integration_id,a.organization_id)
    JOIN public.organizations o ON o.id = a.organization_id
    WHERE a.message_id = p_message AND a.organization_id = p_org AND a.conversation_id = c.id
      AND m.direction = 'INBOUND' AND m.message_type = 'AUDIO'
      AND a.stored AND a.purged_at IS NULL AND a.expires_at > statement_timestamp()
      AND CASE WHEN wi.phone_number_id LIKE 'rhinos-local-simulator:%'
        THEN o.whatsapp_sandbox_audio_enabled ELSE o.whatsapp_audio_enabled END);
END $$;

CREATE OR REPLACE FUNCTION public.notify_whatsapp_inbox_handoff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.notifications(organization_id,user_id,type,title,body,link)
  SELECT NEW.organization_id,m.user_id,'whatsapp_handoff','Conversación de WhatsApp derivada',
    'Hay una conversación esperando atención.',
    '/org/' || o.slug || '/whatsapp/conversaciones?chat=' || NEW.conversation_id
  FROM public.whatsapp_conversations c
  JOIN public.whatsapp_integrations wi ON (wi.id,wi.organization_id) = (c.integration_id,c.organization_id)
  JOIN public.organizations o ON o.id = c.organization_id
  JOIN public.organization_members m ON m.organization_id = o.id
  WHERE c.id = NEW.conversation_id AND c.organization_id = NEW.organization_id
    AND wi.phone_number_id NOT LIKE 'rhinos-local-simulator:%'
    AND public.whatsapp_actor_can_read(o.id,m.user_id) AND public.whatsapp_actor_can_manage(o.id,m.user_id)
    AND (m.user_id = NEW.assigned_user_id OR NOT (
      public.whatsapp_actor_can_read(o.id,NEW.assigned_user_id)
      AND public.whatsapp_actor_can_manage(o.id,NEW.assigned_user_id)
    ))
  GROUP BY o.slug,m.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS whatsapp_inbox_handoff_notification ON public.whatsapp_conversation_events;
CREATE TRIGGER whatsapp_inbox_handoff_notification AFTER INSERT ON public.whatsapp_conversation_events
  FOR EACH ROW WHEN (NEW.type = 'HANDOFF') EXECUTE FUNCTION public.notify_whatsapp_inbox_handoff();

REVOKE ALL ON FUNCTION public.stamp_whatsapp_inbox_item(), public.notify_whatsapp_inbox_handoff()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_actor_can_read(uuid,uuid),
  public.whatsapp_inbox_conversation(uuid,uuid,uuid), public.list_whatsapp_inbox(uuid,uuid,text,text,timestamptz,uuid),
  public.get_whatsapp_inbox_detail(uuid,uuid,uuid), public.get_whatsapp_inbox_history(uuid,uuid,uuid,timestamptz,uuid,boolean),
  public.mark_whatsapp_inbox_read(uuid,uuid,uuid,uuid), public.get_whatsapp_inbox_audio(uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_actor_can_read(uuid,uuid),
  public.whatsapp_inbox_conversation(uuid,uuid,uuid), public.list_whatsapp_inbox(uuid,uuid,text,text,timestamptz,uuid),
  public.get_whatsapp_inbox_detail(uuid,uuid,uuid), public.get_whatsapp_inbox_history(uuid,uuid,uuid,timestamptz,uuid,boolean),
  public.mark_whatsapp_inbox_read(uuid,uuid,uuid,uuid), public.get_whatsapp_inbox_audio(uuid,uuid,uuid,uuid)
  TO service_role;
NOTIFY pgrst, 'reload schema';
