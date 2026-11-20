-- IA Comercial · asistente del vendedor por WhatsApp.
-- El vendedor escribe al mismo número de WhatsApp de la distribuidora. Si su
-- celular está cargado acá, el mensaje lo atiende el asistente comercial en vez
-- del agente de pedidos de clientes.
-- Se puede correr más de una vez sin error.

CREATE TABLE IF NOT EXISTS public.commercial_ai_seller_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Solo dígitos, con código de país (ej. 5491123456789).
  phone text NOT NULL CHECK (phone ~ '^[0-9]{8,15}$'),
  -- Últimos 10 dígitos: así coincide aunque Meta mande 549… y el número se haya cargado como 54… o 11….
  phone_key text GENERATED ALWAYS AS (right(phone, 10)) STORED,
  daily_digest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_ai_seller_phones_user_key UNIQUE (organization_id, user_id),
  CONSTRAINT commercial_ai_seller_phones_phone_key UNIQUE (organization_id, phone_key)
);

-- Historial de la charla con el asistente (contexto para la IA y para no
-- procesar dos veces el mismo mensaje si Meta lo reintenta).
CREATE TABLE IF NOT EXISTS public.commercial_ai_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  external_message_id text,
  message_type text NOT NULL DEFAULT 'TEXT',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_ai_whatsapp_messages_external_key UNIQUE (external_message_id)
);

CREATE INDEX IF NOT EXISTS commercial_ai_whatsapp_messages_user_idx
  ON public.commercial_ai_whatsapp_messages (organization_id, user_id, created_at DESC);

ALTER TABLE public.commercial_ai_seller_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_ai_seller_phones read" ON public.commercial_ai_seller_phones;
CREATE POLICY "commercial_ai_seller_phones read" ON public.commercial_ai_seller_phones
  FOR SELECT USING (
    public.can_manage_commercial_ai(organization_id)
    OR (public.can_use_commercial_ai(organization_id) AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "commercial_ai_seller_phones manage" ON public.commercial_ai_seller_phones;
CREATE POLICY "commercial_ai_seller_phones manage" ON public.commercial_ai_seller_phones
  FOR ALL USING (public.can_manage_commercial_ai(organization_id))
  WITH CHECK (public.can_manage_commercial_ai(organization_id));

DROP POLICY IF EXISTS "commercial_ai_whatsapp_messages read" ON public.commercial_ai_whatsapp_messages;
CREATE POLICY "commercial_ai_whatsapp_messages read" ON public.commercial_ai_whatsapp_messages
  FOR SELECT USING (
    public.can_manage_commercial_ai(organization_id)
    OR (public.can_use_commercial_ai(organization_id) AND user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_seller_phones TO authenticated;
GRANT SELECT ON public.commercial_ai_whatsapp_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_seller_phones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_whatsapp_messages TO service_role;
