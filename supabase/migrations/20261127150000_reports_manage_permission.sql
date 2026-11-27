-- Solo administradores y roles autorizados pueden usar Reportes.
-- No asignar este permiso automáticamente al rol vendedor.
INSERT INTO public.permissions (key, description)
VALUES (
  'reports.manage',
  'Abrir, crear y compartir reportes; requiere además permisos sobre cada fuente de datos'
)
ON CONFLICT (key) DO NOTHING;

-- Los roles admin preexistentes también reciben el permiso si el trigger
-- de permisos nuevos todavía no está instalado en este entorno.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = 'reports.manage'
WHERE r.key = 'admin'
ON CONFLICT DO NOTHING;

-- La migración anterior permitía leer especificaciones compartidas a cualquier
-- miembro. Cerramos también el acceso directo a la tabla (no solo la UI/API).
DROP POLICY IF EXISTS "report_saved_views_select" ON public.report_saved_views;
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
    AND (
      coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
      OR coalesce(public.user_has_org_permission('reports.manage', organization_id), false)
    )
  );

DROP POLICY IF EXISTS "report_saved_views_insert" ON public.report_saved_views;
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
    AND (
      coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
      OR coalesce(public.user_has_org_permission('reports.manage', organization_id), false)
    )
  );

DROP POLICY IF EXISTS "report_saved_views_update" ON public.report_saved_views;
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
    AND (
      coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
      OR coalesce(public.user_has_org_permission('reports.manage', organization_id), false)
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
    AND (
      coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
      OR coalesce(public.user_has_org_permission('reports.manage', organization_id), false)
    )
  );

DROP POLICY IF EXISTS "report_saved_views_delete" ON public.report_saved_views;
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
    AND (
      coalesce(public.user_has_org_permission('organization.admin', organization_id), false)
      OR coalesce(public.user_has_org_permission('reports.manage', organization_id), false)
    )
  );
