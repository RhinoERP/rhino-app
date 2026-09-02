-- ============================================================
-- 20260902000000_harden_category_accounting_rules.sql
--
-- Endurece el acceso a category_accounting_rules. La tabla fue creada sin RLS
-- y el servicio usaba createAdminClient() (bypass de RLS) para leer/escribir.
-- Se habilita RLS con funciones helper que respetan pertenencia de org y
-- permiso de gestión de inventario.
-- ============================================================

-- Acceso de lectura: cualquier miembro activo de la organización puede ver
-- las reglas contables de sus categorías (necesario para el detalle de
-- producto y la consulta de stock).
CREATE OR REPLACE FUNCTION public.can_view_category_accounting_rules(
  p_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  );
$$;

-- Acceso de escritura: solo dueño, admin o rol con permiso de gestión de
-- inventario. Coincide con el guard de las server actions (inventory.manage).
CREATE OR REPLACE FUNCTION public.can_manage_category_inventory(
  p_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    LEFT JOIN public.role_permissions rp ON rp.role_id = om.role_id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND (
        om.is_owner = true OR p.key IN (
          'organization.admin', 'inventory.manage'
        )
      )
  );
$$;

ALTER TABLE public.category_accounting_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_accounting_rules_org_member_read
  ON public.category_accounting_rules;
DROP POLICY IF EXISTS category_accounting_rules_inventory_insert
  ON public.category_accounting_rules;
DROP POLICY IF EXISTS category_accounting_rules_inventory_update
  ON public.category_accounting_rules;
DROP POLICY IF EXISTS category_accounting_rules_inventory_delete
  ON public.category_accounting_rules;

CREATE POLICY category_accounting_rules_org_member_read
  ON public.category_accounting_rules FOR SELECT
  USING (public.can_view_category_accounting_rules(organization_id));

CREATE POLICY category_accounting_rules_inventory_insert
  ON public.category_accounting_rules FOR INSERT
  WITH CHECK (
    public.can_manage_category_inventory(organization_id)
  );

CREATE POLICY category_accounting_rules_inventory_update
  ON public.category_accounting_rules FOR UPDATE
  USING (public.can_manage_category_inventory(organization_id))
  WITH CHECK (public.can_manage_category_inventory(organization_id));

CREATE POLICY category_accounting_rules_inventory_delete
  ON public.category_accounting_rules FOR DELETE
  USING (public.can_manage_category_inventory(organization_id));