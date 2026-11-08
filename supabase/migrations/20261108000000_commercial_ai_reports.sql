-- IA Comercial · Generador de reportes.
-- 1) Los reportes que arma RHINO con IA descuentan créditos (feature "reporte").
-- 2) Reportes guardados: cada usuario guarda los suyos y puede compartirlos
--    con la organización.
-- Se puede correr más de una vez sin error.

ALTER TABLE public.commercial_ai_usage
  DROP CONSTRAINT IF EXISTS commercial_ai_usage_feature_check;
ALTER TABLE public.commercial_ai_usage
  ADD CONSTRAINT commercial_ai_usage_feature_check
  CHECK (feature IN ('asistente', 'campana', 'prueba', 'whatsapp', 'audio', 'factura', 'reporte'));

CREATE TABLE IF NOT EXISTS public.commercial_ai_saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  spec jsonb NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_ai_saved_reports_org_idx
  ON public.commercial_ai_saved_reports (organization_id, updated_at DESC);

ALTER TABLE public.commercial_ai_saved_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_ai_saved_reports_select ON public.commercial_ai_saved_reports;
CREATE POLICY commercial_ai_saved_reports_select
  ON public.commercial_ai_saved_reports FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() OR shared)
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = commercial_ai_saved_reports.organization_id
        AND m.user_id = auth.uid()
        AND m.disabled_at IS NULL
    )
  );

DROP POLICY IF EXISTS commercial_ai_saved_reports_insert ON public.commercial_ai_saved_reports;
CREATE POLICY commercial_ai_saved_reports_insert
  ON public.commercial_ai_saved_reports FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = commercial_ai_saved_reports.organization_id
        AND m.user_id = auth.uid()
        AND m.disabled_at IS NULL
    )
  );

DROP POLICY IF EXISTS commercial_ai_saved_reports_update ON public.commercial_ai_saved_reports;
CREATE POLICY commercial_ai_saved_reports_update
  ON public.commercial_ai_saved_reports FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS commercial_ai_saved_reports_delete ON public.commercial_ai_saved_reports;
CREATE POLICY commercial_ai_saved_reports_delete
  ON public.commercial_ai_saved_reports FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_ai_saved_reports TO authenticated;
GRANT ALL ON public.commercial_ai_saved_reports TO service_role;
