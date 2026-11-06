-- IA Comercial · fase 2: rutas, prospección (perfiles, campañas, corridas, prospectos) y aprendizajes.
-- Se puede correr más de una vez sin error.

-- ============ Territorios y partidas ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Localidades que forman la zona; un cliente cae acá si su localidad coincide.
  places text[] NOT NULL DEFAULT '{}',
  seller_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_ai_territories_org_idx
  ON public.commercial_ai_territories (organization_id);

CREATE TABLE IF NOT EXISTS public.commercial_ai_route_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Rutas ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  route_date date NOT NULL,
  territory_id uuid REFERENCES public.commercial_ai_territories(id) ON DELETE SET NULL,
  places text[] NOT NULL DEFAULT '{}',
  start_label text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_ai_routes_org_date_idx
  ON public.commercial_ai_routes (organization_id, route_date);

-- ============ Perfiles de cliente ideal ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_icps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Rubros que buscamos (se usan para buscar y para puntuar el encaje).
  keywords text[] NOT NULL DEFAULT '{}',
  personas text[] NOT NULL DEFAULT '{}',
  value_proposition text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Campañas y corridas ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'activa', 'pausada', 'archivada')),
  goal_count integer CHECK (goal_count IS NULL OR goal_count > 0),
  goal_kind text CHECK (goal_kind IS NULL OR goal_kind IN ('contactadas', 'reuniones', 'respuestas')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  affinity_min integer NOT NULL DEFAULT 40 CHECK (affinity_min BETWEEN 1 AND 100),
  max_per_run integer NOT NULL DEFAULT 20 CHECK (max_per_run BETWEEN 1 AND 200),
  icp_id uuid REFERENCES public.commercial_ai_icps(id) ON DELETE SET NULL,
  persona text,
  source text NOT NULL DEFAULT 'lista' CHECK (source IN ('lista', 'google_places')),
  country text NOT NULL DEFAULT 'Argentina',
  zones text[] NOT NULL DEFAULT '{}',
  exclusions text[] NOT NULL DEFAULT '{}',
  entry_strategy text NOT NULL DEFAULT 'ia'
    CHECK (entry_strategy IN ('catalogo', 'ia')),
  catalog_url text,
  ask text NOT NULL DEFAULT 'responder'
    CHECK (ask IN ('responder', 'diagnostico', 'reunion', 'visita')),
  channels text[] NOT NULL DEFAULT '{whatsapp}',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_ai_campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.commercial_ai_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'terminada'
    CHECK (status IN ('corriendo', 'terminada', 'fallida')),
  found integer NOT NULL DEFAULT 0,
  discarded integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  used_ai boolean NOT NULL DEFAULT false,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- ============ Prospectos ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.commercial_ai_campaigns(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.commercial_ai_campaign_runs(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text,
  address text,
  city text,
  province text,
  phone text,
  email text,
  website text,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  fit_score integer NOT NULL DEFAULT 50 CHECK (fit_score BETWEEN 0 AND 100),
  fit_reasons text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'sin_contactar'
    CHECK (stage IN ('sin_contactar', 'contactado', 'en_conversacion', 'esperando_pedido', 'perdido', 'descartado')),
  message text NOT NULL DEFAULT '',
  next_step text,
  next_step_date date,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_ai_prospects_external_idx
  ON public.commercial_ai_prospects (organization_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commercial_ai_prospects_org_stage_idx
  ON public.commercial_ai_prospects (organization_id, stage);

CREATE TABLE IF NOT EXISTS public.commercial_ai_prospect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES public.commercial_ai_prospects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'stage', 'visit', 'system')),
  body text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_ai_prospect_events_idx
  ON public.commercial_ai_prospect_events (organization_id, prospect_id, created_at DESC);

-- Paradas: clientes o prospectos (se crea después de prospectos por la referencia).
CREATE TABLE IF NOT EXISTS public.commercial_ai_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.commercial_ai_routes(id) ON DELETE CASCADE,
  position integer NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES public.commercial_ai_prospects(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  result text CHECK (result IS NULL OR result IN ('pedido', 'interesado', 'noestaba', 'seguimiento', 'nofue')),
  note text NOT NULL DEFAULT '',
  result_at timestamptz,
  CHECK ((customer_id IS NULL) <> (prospect_id IS NULL))
);
CREATE INDEX IF NOT EXISTS commercial_ai_route_stops_route_idx
  ON public.commercial_ai_route_stops (route_id, position);

-- ============ Aprendizajes ============
CREATE TABLE IF NOT EXISTS public.commercial_ai_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'nota' CHECK (kind IN ('nota', 'patron')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'propuesta', 'descartada')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS (mismas reglas que la fase 1) ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commercial_ai_territories', 'commercial_ai_route_starts', 'commercial_ai_routes',
    'commercial_ai_route_stops', 'commercial_ai_icps', 'commercial_ai_campaigns',
    'commercial_ai_campaign_runs', 'commercial_ai_prospects', 'commercial_ai_prospect_events',
    'commercial_ai_learnings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s read" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s read" ON public.%I FOR SELECT USING (public.can_use_commercial_ai(organization_id))',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS "%s write" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s write" ON public.%I FOR ALL USING (public.can_use_commercial_ai(organization_id)) WITH CHECK (public.can_use_commercial_ai(organization_id))',
      t, t
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role',
      t
    );
  END LOOP;
END $$;
