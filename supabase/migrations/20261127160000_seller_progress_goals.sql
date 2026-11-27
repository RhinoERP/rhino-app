-- Metas mensuales por vendedor; el avance y la actividad se calculan desde
-- ventas, solicitudes y visitas existentes, sin duplicar esos datos.
CREATE TABLE IF NOT EXISTS public.seller_progress_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
  target_amount numeric(18, 2) NOT NULL CHECK (target_amount >= 0),
  levers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, seller_id, period_month)
);

CREATE INDEX IF NOT EXISTS seller_progress_goals_period_idx
  ON public.seller_progress_goals (organization_id, period_month);

ALTER TABLE public.seller_progress_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller_progress_goals_read" ON public.seller_progress_goals
  FOR SELECT TO authenticated USING (
    coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
    OR (
      seller_id = (SELECT auth.uid())
      AND (
        coalesce(public.user_has_org_permission('sales.read', organization_id), false)
        OR coalesce(public.user_has_org_permission('sales.read.all', organization_id), false)
        OR coalesce(public.user_has_org_permission('sales.manage', organization_id), false)
        OR coalesce(public.user_has_org_permission('sales.manage.all', organization_id), false)
      )
    )
  );

CREATE POLICY "seller_progress_goals_insert" ON public.seller_progress_goals
  FOR INSERT TO authenticated WITH CHECK (
    coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
  );
CREATE POLICY "seller_progress_goals_update" ON public.seller_progress_goals
  FOR UPDATE TO authenticated
  USING (coalesce(public.user_has_org_permission('organization.admin', organization_id), false))
  WITH CHECK (coalesce(public.user_has_org_permission('organization.admin', organization_id), false));
CREATE POLICY "seller_progress_goals_delete" ON public.seller_progress_goals
  FOR DELETE TO authenticated
  USING (coalesce(public.user_has_org_permission('organization.admin', organization_id), false));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_progress_goals TO authenticated, service_role;
