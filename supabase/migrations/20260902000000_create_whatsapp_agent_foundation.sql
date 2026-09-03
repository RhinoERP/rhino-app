-- Fundación del asistente comercial por WhatsApp.
-- Las claves compuestas con organization_id hacen que el aislamiento sea una
-- propiedad de la base, aun cuando las operaciones futuras se ejecuten con
-- una credencial de integración.

CREATE UNIQUE INDEX IF NOT EXISTS customers_id_organization_id_key
  ON public.customers (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_id_organization_id_key
  ON public.sales_orders (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_price_lists_id_organization_id_key
  ON public.sales_price_lists (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_user_id_organization_id_key
  ON public.organization_members (user_id, organization_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  display_phone_number text,
  status text NOT NULL DEFAULT 'DRAFT',
  sales_price_list_id uuid,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  handoff_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_integrations_status_check CHECK (
    status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED')
  ),
  CONSTRAINT whatsapp_integrations_active_config_check CHECK (
    status <> 'ACTIVE'
    OR (sales_price_list_id IS NOT NULL AND responsible_user_id IS NOT NULL)
  ),
  CONSTRAINT whatsapp_integrations_phone_number_id_key UNIQUE (phone_number_id),
  CONSTRAINT whatsapp_integrations_id_organization_id_key UNIQUE (id, organization_id),
  CONSTRAINT whatsapp_integrations_price_list_organization_fkey
    FOREIGN KEY (sales_price_list_id, organization_id)
    REFERENCES public.sales_price_lists (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT whatsapp_integrations_responsible_member_organization_fkey
    FOREIGN KEY (responsible_user_id, organization_id)
    REFERENCES public.organization_members (user_id, organization_id)
    ON DELETE RESTRICT
);

-- Las referencias a secretos nunca se seleccionan desde el navegador. El
-- worker podrá leerlas con service role en la fase del canal; ninguna policy
-- permite el acceso de usuarios autenticados a esta tabla.
CREATE TABLE IF NOT EXISTS public.whatsapp_integration_secrets (
  integration_id uuid PRIMARY KEY REFERENCES public.whatsapp_integrations(id) ON DELETE CASCADE,
  access_token_secret_ref text NOT NULL,
  app_secret_ref text NOT NULL,
  verify_token_secret_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  customer_phone text NOT NULL,
  customer_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE',
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handoff_reason text,
  bot_paused_at timestamptz,
  bot_paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_status_check CHECK (
    status IN ('ACTIVE', 'PAUSED', 'HANDOFF', 'CLOSED')
  ),
  CONSTRAINT whatsapp_conversations_phone_not_blank CHECK (length(btrim(customer_phone)) > 0),
  CONSTRAINT whatsapp_conversations_integration_organization_fkey
    FOREIGN KEY (integration_id, organization_id)
    REFERENCES public.whatsapp_integrations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT whatsapp_conversations_customer_organization_fkey
    FOREIGN KEY (customer_id, organization_id)
    REFERENCES public.customers (id, organization_id)
    ON DELETE SET NULL (customer_id),
  CONSTRAINT whatsapp_conversations_id_organization_id_key UNIQUE (id, organization_id),
  CONSTRAINT whatsapp_conversations_id_organization_integration_key
    UNIQUE (id, organization_id, integration_id),
  CONSTRAINT whatsapp_conversations_integration_phone_key
    UNIQUE (integration_id, customer_phone)
);

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_source_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_source_check CHECK (
    source IN ('MANUAL', 'WHATSAPP')
  );

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_conversation_organization_fkey;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_conversation_organization_fkey
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.whatsapp_conversations (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS current_pre_sale_id uuid;

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_pre_sale_organization_fkey;
ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_pre_sale_organization_fkey
    FOREIGN KEY (current_pre_sale_id, organization_id)
    REFERENCES public.sales_orders (id, organization_id)
    ON DELETE SET NULL (current_pre_sale_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  external_message_id text NOT NULL,
  direction text NOT NULL,
  message_type text NOT NULL DEFAULT 'TEXT',
  content text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL DEFAULT 'RECEIVED',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_direction_check CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  CONSTRAINT whatsapp_messages_type_check CHECK (
    message_type IN ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'INTERACTIVE', 'SYSTEM')
  ),
  CONSTRAINT whatsapp_messages_delivery_status_check CHECK (
    delivery_status IN ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')
  ),
  CONSTRAINT whatsapp_messages_external_message_id_key UNIQUE (external_message_id),
  CONSTRAINT whatsapp_messages_conversation_integration_organization_fkey
    FOREIGN KEY (conversation_id, organization_id, integration_id)
    REFERENCES public.whatsapp_conversations (id, organization_id, integration_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.conversation_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  currency text NOT NULL DEFAULT 'ARS',
  quoted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_carts_status_check CHECK (
    status IN ('OPEN', 'QUOTED', 'CONFIRMED', 'CONVERTED', 'ABANDONED')
  ),
  CONSTRAINT conversation_carts_conversation_organization_fkey
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.whatsapp_conversations (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT conversation_carts_conversation_key UNIQUE (conversation_id),
  CONSTRAINT conversation_carts_id_organization_id_key UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS public.conversation_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cart_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  price_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_cart_items_cart_organization_fkey
    FOREIGN KEY (cart_id, organization_id)
    REFERENCES public.conversation_carts (id, organization_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_jobs_status_check CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRY', 'FAILED', 'CANCELLED')
  ),
  CONSTRAINT agent_jobs_source_message_key UNIQUE (source_message_id),
  CONSTRAINT agent_jobs_conversation_integration_organization_fkey
    FOREIGN KEY (conversation_id, organization_id, integration_id)
    REFERENCES public.whatsapp_conversations (id, organization_id, integration_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  agent_job_id uuid REFERENCES public.agent_jobs(id) ON DELETE SET NULL,
  provider text,
  model text,
  status text NOT NULL DEFAULT 'STARTED',
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  cost_amount numeric(14,6) CHECK (cost_amount >= 0),
  latency_ms integer CHECK (latency_ms >= 0),
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT agent_runs_status_check CHECK (
    status IN ('STARTED', 'SUCCEEDED', 'HANDOFF', 'FAILED')
  ),
  CONSTRAINT agent_runs_conversation_integration_organization_fkey
    FOREIGN KEY (conversation_id, organization_id, integration_id)
    REFERENCES public.whatsapp_conversations (id, organization_id, integration_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS whatsapp_integrations_organization_status_idx
  ON public.whatsapp_integrations (organization_id, status);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_inbox_idx
  ON public.whatsapp_conversations (organization_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_created_idx
  ON public.whatsapp_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS conversation_cart_items_cart_idx
  ON public.conversation_cart_items (cart_id);
CREATE INDEX IF NOT EXISTS agent_jobs_claim_idx
  ON public.agent_jobs (available_at, created_at)
  WHERE status IN ('PENDING', 'RETRY');
CREATE INDEX IF NOT EXISTS agent_runs_conversation_started_idx
  ON public.agent_runs (conversation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sales_orders_whatsapp_conversation_idx
  ON public.sales_orders (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- update_updated_at_column is the shared trigger function created by the
-- orders migration. Keep all mutable foundation rows consistent with it.
CREATE TRIGGER set_whatsapp_integrations_updated_at
  BEFORE UPDATE ON public.whatsapp_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_whatsapp_integration_secrets_updated_at
  BEFORE UPDATE ON public.whatsapp_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_conversation_carts_updated_at
  BEFORE UPDATE ON public.conversation_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_conversation_cart_items_updated_at
  BEFORE UPDATE ON public.conversation_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_agent_jobs_updated_at
  BEFORE UPDATE ON public.agent_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_organization_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_responsible_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsible_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = NEW.organization_id
      AND om.user_id = NEW.responsible_user_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'El vendedor responsable debe ser un miembro activo de la organización';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_whatsapp_responsible_member
  BEFORE INSERT OR UPDATE OF responsible_user_id, organization_id
  ON public.whatsapp_integrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_responsible_member();

CREATE POLICY whatsapp_integrations_active_member_access
  ON public.whatsapp_integrations FOR ALL
  USING (public.is_active_organization_member(organization_id))
  WITH CHECK (public.is_active_organization_member(organization_id));

CREATE POLICY whatsapp_conversations_active_member_access
  ON public.whatsapp_conversations FOR ALL
  USING (public.is_active_organization_member(organization_id))
  WITH CHECK (public.is_active_organization_member(organization_id));

CREATE POLICY whatsapp_messages_active_member_access
  ON public.whatsapp_messages FOR SELECT
  USING (public.is_active_organization_member(organization_id));

CREATE POLICY conversation_carts_active_member_access
  ON public.conversation_carts FOR SELECT
  USING (public.is_active_organization_member(organization_id));

CREATE POLICY conversation_cart_items_active_member_access
  ON public.conversation_cart_items FOR SELECT
  USING (public.is_active_organization_member(organization_id));

CREATE POLICY agent_jobs_active_member_access
  ON public.agent_jobs FOR SELECT
  USING (public.is_active_organization_member(organization_id));

CREATE POLICY agent_runs_active_member_access
  ON public.agent_runs FOR SELECT
  USING (public.is_active_organization_member(organization_id));

INSERT INTO public.permissions (key, description) VALUES
  ('whatsapp.read', 'Ver conversaciones de WhatsApp de la organización'),
  ('whatsapp.manage', 'Atender y asignar conversaciones de WhatsApp'),
  ('whatsapp.configure', 'Configurar la integración de WhatsApp'),
  ('whatsapp.metrics', 'Ver métricas del asistente comercial de WhatsApp')
ON CONFLICT (key) DO NOTHING;
