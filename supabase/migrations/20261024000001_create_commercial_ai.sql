-- IA Comercial (Cartera Viva): permisos, asignación a roles y tablas de estado.
-- El análisis de cartera se calcula en el servidor a partir de sales_orders;
-- estas tablas solo guardan lo que el equipo hace con ese análisis.

-- ============ Permisos ============
INSERT INTO public.permissions (key, description) VALUES
  ('commercial_ai.read',   'Usar IA Comercial con la cartera propia: oportunidades, clientes y asistente'),
  ('commercial_ai.manage', 'Ver todo el equipo en IA Comercial, fijar objetivos y configurar el análisis')
ON CONFLICT (key) DO NOTHING;

-- Rol Gerente en cada organización que todavía no lo tenga (mismo key que producción).
INSERT INTO public.roles (organization_id, key, name, description)
SELECT o.id, 'gerente', 'Gerente', 'Gerente comercial: ve a todo el equipo, fija objetivos y sigue la cartera'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r WHERE r.organization_id = o.id AND r.key = 'gerente'
);

-- Gerente y Administrador: todo. Vendedor: su cartera.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p
  ON (r.key IN ('gerente', 'admin') AND p.key IN ('commercial_ai.read', 'commercial_ai.manage'))
  OR (r.key = 'vendedor' AND p.key = 'commercial_ai.read')
ON CONFLICT DO NOTHING;

-- ============ Configuración del análisis por organización ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Estado de cada oportunidad detectada ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_opportunity_states (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_key text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'nueva'
    CHECK (stage IN ('nueva', 'contactada', 'respondio', 'ganada', 'perdida', 'ignorada', 'despues')),
  snooze_until date,
  contacted_at timestamptz,
  last_touched_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, opportunity_key)
);

CREATE INDEX IF NOT EXISTS commercial_ai_opportunity_states_customer_idx
  ON public.commercial_ai_opportunity_states (organization_id, customer_id);

-- ============ Historial: notas, cambios de etapa, preventas ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_key text,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'stage', 'preventa', 'task')),
  body text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_ai_events_customer_idx
  ON public.commercial_ai_events (organization_id, customer_id, created_at DESC);

-- ============ Próximos pasos (tareas) ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  due_date date NOT NULL,
  done_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_ai_tasks_seller_idx
  ON public.commercial_ai_tasks (organization_id, seller_id, due_date);

-- ============ Objetivos mensuales (equipo = seller_id NULL) ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  seller_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_amount numeric(18, 2) NOT NULL CHECK (target_amount >= 0),
  levers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, period_month, seller_id)
);

-- ============ RLS ============
ALTER TABLE public.commercial_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_opportunity_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_ai_goals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_use_commercial_ai(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_org_permission('organization.admin', p_org_id)
      OR public.user_has_org_permission('commercial_ai.manage', p_org_id)
      OR public.user_has_org_permission('commercial_ai.read', p_org_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_commercial_ai(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_org_permission('organization.admin', p_org_id)
      OR public.user_has_org_permission('commercial_ai.manage', p_org_id);
$$;

DROP POLICY IF EXISTS "commercial_ai_settings read" ON public.commercial_ai_settings;
CREATE POLICY "commercial_ai_settings read" ON public.commercial_ai_settings
  FOR SELECT USING (public.can_use_commercial_ai(organization_id));
DROP POLICY IF EXISTS "commercial_ai_settings manage" ON public.commercial_ai_settings;
CREATE POLICY "commercial_ai_settings manage" ON public.commercial_ai_settings
  FOR ALL USING (public.can_manage_commercial_ai(organization_id))
  WITH CHECK (public.can_manage_commercial_ai(organization_id));

DROP POLICY IF EXISTS "commercial_ai_opportunity_states use" ON public.commercial_ai_opportunity_states;
CREATE POLICY "commercial_ai_opportunity_states use" ON public.commercial_ai_opportunity_states
  FOR ALL USING (public.can_use_commercial_ai(organization_id))
  WITH CHECK (public.can_use_commercial_ai(organization_id));

DROP POLICY IF EXISTS "commercial_ai_events use" ON public.commercial_ai_events;
CREATE POLICY "commercial_ai_events use" ON public.commercial_ai_events
  FOR ALL USING (public.can_use_commercial_ai(organization_id))
  WITH CHECK (public.can_use_commercial_ai(organization_id));

DROP POLICY IF EXISTS "commercial_ai_tasks use" ON public.commercial_ai_tasks;
CREATE POLICY "commercial_ai_tasks use" ON public.commercial_ai_tasks
  FOR ALL USING (public.can_use_commercial_ai(organization_id))
  WITH CHECK (public.can_use_commercial_ai(organization_id));

DROP POLICY IF EXISTS "commercial_ai_goals read" ON public.commercial_ai_goals;
CREATE POLICY "commercial_ai_goals read" ON public.commercial_ai_goals
  FOR SELECT USING (public.can_use_commercial_ai(organization_id));
DROP POLICY IF EXISTS "commercial_ai_goals manage" ON public.commercial_ai_goals;
CREATE POLICY "commercial_ai_goals manage" ON public.commercial_ai_goals
  FOR ALL USING (public.can_manage_commercial_ai(organization_id))
  WITH CHECK (public.can_manage_commercial_ai(organization_id));

-- ============ Acceso a las tablas (proyectos sin grants automáticos) ============
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.commercial_ai_settings,
  public.commercial_ai_opportunity_states,
  public.commercial_ai_events,
  public.commercial_ai_tasks,
  public.commercial_ai_goals
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.can_use_commercial_ai(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_commercial_ai(uuid) TO authenticated, service_role;
