-- Keep the inventory/Meli permission contract while requiring an active tenant.
-- Meli-only inventory access follows the same POS module flag as its server readers.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_inventory_stock_read_context(p_org_id uuid)
RETURNS TABLE (can_read_inventory boolean, can_read_mercadolibre boolean, can_view_costs boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN (
      'organization.admin', 'inventory.read', 'inventory.read.all', 'inventory.manage'
    )), false),
    (o.pos_enabled IS DISTINCT FROM false) AND (
      coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN (
        'organization.admin', 'mercadolibre.access', 'mercadolibre.manage', 'mercadolibre.invoice'
      )), false)
    ),
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN (
      'organization.admin', 'inventory.manage'
    )), false)
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id AND o.is_active
  LEFT JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  LEFT JOIN public.permissions p ON p.id = rp.permission_id
  WHERE m.organization_id = p_org_id AND m.user_id = (SELECT auth.uid()) AND m.is_active
  GROUP BY m.is_owner, o.pos_enabled;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_stock_read_context(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_stock_read_context(uuid) TO authenticated, service_role;

COMMIT;
