-- Reportes independientes: especificaciones guardadas, no datos materializados.
-- Los datos se vuelven a consultar con los permisos actuales de quien abre el reporte.
CREATE TABLE IF NOT EXISTS public.report_saved_views (
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

CREATE INDEX IF NOT EXISTS report_saved_views_org_idx
  ON public.report_saved_views (organization_id, updated_at DESC);

ALTER TABLE public.report_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_saved_views_select" ON public.report_saved_views
  FOR SELECT TO authenticated USING (
    (user_id = (SELECT auth.uid()) OR shared)
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = report_saved_views.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND m.disabled_at IS NULL
    )
  );

CREATE POLICY "report_saved_views_insert" ON public.report_saved_views
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = report_saved_views.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND m.disabled_at IS NULL
    )
  );

CREATE POLICY "report_saved_views_update" ON public.report_saved_views
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = report_saved_views.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND m.disabled_at IS NULL
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = report_saved_views.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND m.disabled_at IS NULL
    )
  );

CREATE POLICY "report_saved_views_delete" ON public.report_saved_views
  FOR DELETE TO authenticated USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = report_saved_views.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND m.disabled_at IS NULL
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_saved_views TO authenticated;
