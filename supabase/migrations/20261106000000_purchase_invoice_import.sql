-- Compras · cargar una factura de proveedor desde el PDF.
-- 1) La lectura del PDF con IA descuenta créditos como el resto (feature "factura").
-- 2) Equivalencias recordadas: "esta línea de este proveedor es este producto",
--    para que la próxima factura del mismo proveedor se arme sola.
-- Se puede correr más de una vez sin error.

ALTER TABLE public.commercial_ai_usage
  DROP CONSTRAINT IF EXISTS commercial_ai_usage_feature_check;
ALTER TABLE public.commercial_ai_usage
  ADD CONSTRAINT commercial_ai_usage_feature_check
  CHECK (feature IN ('asistente', 'campana', 'prueba', 'whatsapp', 'audio', 'factura'));

CREATE TABLE IF NOT EXISTS public.purchase_invoice_product_aliases (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  -- Código del artículo en la factura ("cod:...") o su descripción ("txt:...").
  alias_key text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, supplier_id, alias_key)
);

ALTER TABLE public.purchase_invoice_product_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_invoice_product_aliases read" ON public.purchase_invoice_product_aliases;
CREATE POLICY "purchase_invoice_product_aliases read" ON public.purchase_invoice_product_aliases
  FOR SELECT USING (public.user_has_org_permission('purchases.manage', organization_id));

DROP POLICY IF EXISTS "purchase_invoice_product_aliases write" ON public.purchase_invoice_product_aliases;
CREATE POLICY "purchase_invoice_product_aliases write" ON public.purchase_invoice_product_aliases
  FOR ALL
  USING (public.user_has_org_permission('purchases.manage', organization_id))
  WITH CHECK (public.user_has_org_permission('purchases.manage', organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_product_aliases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_product_aliases TO service_role;
