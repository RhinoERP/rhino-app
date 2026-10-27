-- IA Comercial · registros con ubicación (check-ins).
-- Cada vez que alguien registra una visita, la app guarda dónde estaba, cuándo y con qué precisión.
-- Se puede correr más de una vez sin error.

CREATE TABLE IF NOT EXISTS public.commercial_ai_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  route_id uuid REFERENCES public.commercial_ai_routes(id) ON DELETE SET NULL,
  stop_id uuid REFERENCES public.commercial_ai_route_stops(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES public.commercial_ai_prospects(id) ON DELETE CASCADE,
  result text CHECK (result IS NULL OR result IN ('pedido', 'interesado', 'noestaba', 'seguimiento', 'nofue')),
  note text NOT NULL DEFAULT '',
  -- NULL si el celular no dio la ubicación (permiso negado, sin señal).
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  location_error text,
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_id IS NOT NULL OR prospect_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS commercial_ai_checkins_org_created_idx
  ON public.commercial_ai_checkins (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_ai_checkins_customer_idx
  ON public.commercial_ai_checkins (organization_id, customer_id, created_at DESC);

ALTER TABLE public.commercial_ai_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_ai_checkins read" ON public.commercial_ai_checkins;
CREATE POLICY "commercial_ai_checkins read" ON public.commercial_ai_checkins
  FOR SELECT USING (
    public.can_manage_commercial_ai(organization_id)
    OR (public.can_use_commercial_ai(organization_id) AND user_id = auth.uid())
  );

GRANT SELECT ON public.commercial_ai_checkins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_checkins TO service_role;
