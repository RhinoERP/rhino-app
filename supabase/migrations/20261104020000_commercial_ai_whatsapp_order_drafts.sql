-- IA Comercial · pedidos cargados por el vendedor desde WhatsApp.
-- El asistente arma el pedido, se lo muestra con el total y lo guarda acá
-- hasta que el vendedor responde "sí". Recién ahí se crea la preventa.
-- Un borrador por vendedor: armar otro reemplaza al anterior.
-- Se puede correr más de una vez sin error.

CREATE TABLE IF NOT EXISTS public.commercial_ai_whatsapp_order_drafts (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- Ítems pedidos, precios cotizados y nota.
  payload jsonb NOT NULL,
  total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE public.commercial_ai_whatsapp_order_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_ai_whatsapp_order_drafts read" ON public.commercial_ai_whatsapp_order_drafts;
CREATE POLICY "commercial_ai_whatsapp_order_drafts read" ON public.commercial_ai_whatsapp_order_drafts
  FOR SELECT USING (
    public.can_manage_commercial_ai(organization_id)
    OR (public.can_use_commercial_ai(organization_id) AND user_id = auth.uid())
  );

GRANT SELECT ON public.commercial_ai_whatsapp_order_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_whatsapp_order_drafts TO service_role;
