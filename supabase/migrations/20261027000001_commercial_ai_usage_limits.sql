-- IA Comercial · consumo de IA y topes mensuales por organización.
-- Cada llamada al modelo queda registrada con sus tokens y su costo en dólares.
-- Los topes los fija un superadmin de Rhinos; la organización solo los puede leer.
-- Se puede correr más de una vez sin error.

CREATE TABLE IF NOT EXISTS public.commercial_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  feature text NOT NULL CHECK (feature IN ('asistente', 'campana', 'prueba')),
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_ai_usage_org_created_idx
  ON public.commercial_ai_usage (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commercial_ai_limits (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL = sin tope (solo si el cliente lo contrató).
  monthly_usd_limit numeric(10, 2) CHECK (monthly_usd_limit IS NULL OR monthly_usd_limit >= 0),
  per_user_monthly_usd_limit numeric(10, 2)
    CHECK (per_user_monthly_usd_limit IS NULL OR per_user_monthly_usd_limit >= 0),
  notes text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commercial_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_limits ENABLE ROW LEVEL SECURITY;

-- Lectura: el consumo lo ven gerentes y admins; el tope lo ve cualquiera del módulo.
-- Escritura: solo el servidor (service_role), que valida superadmin para los topes.
DROP POLICY IF EXISTS "commercial_ai_usage read" ON public.commercial_ai_usage;
CREATE POLICY "commercial_ai_usage read" ON public.commercial_ai_usage
  FOR SELECT USING (public.can_manage_commercial_ai(organization_id));

DROP POLICY IF EXISTS "commercial_ai_limits read" ON public.commercial_ai_limits;
CREATE POLICY "commercial_ai_limits read" ON public.commercial_ai_limits
  FOR SELECT USING (public.can_use_commercial_ai(organization_id));

GRANT SELECT ON public.commercial_ai_usage, public.commercial_ai_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_usage, public.commercial_ai_limits TO service_role;
