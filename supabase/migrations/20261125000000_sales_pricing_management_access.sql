BEGIN;

-- Margin levels and special adjustments share the same management permission.
-- Commercial readers still need these records to calculate assigned prices.
CREATE FUNCTION public.can_access_sales_pricing(p_org_id uuid, p_write boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = p_org_id
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active
      AND m.disabled_at IS NULL
      AND o.is_active
      AND (
        m.is_owner
        OR EXISTS (
          SELECT 1
          FROM public.roles r
          JOIN public.role_permissions rp ON rp.role_id = r.id
          JOIN public.permissions p ON p.id = rp.permission_id
          WHERE r.id = m.role_id AND r.organization_id = m.organization_id
            AND (
              p.key IN ('organization.admin', 'pricelists.manage')
              OR (p_write IS FALSE AND p.key IN (
                'pricelists.read', 'pricelists.read.all',
                'sales.read', 'sales.read.all', 'sales.manage', 'sales.manage.all',
                'quotes.read', 'quotes.read.all', 'quotes.manage', 'quotes.manage.all',
                'customers.read', 'customers.read.all', 'customers.manage',
                'pos.read', 'pos.read.all', 'pos.manage',
                'commissions.read', 'whatsapp.read', 'whatsapp.manage'
              ))
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_sales_pricing(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_sales_pricing(uuid, boolean) TO authenticated, service_role;

ALTER TABLE public.sales_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_levels ENABLE ROW LEVEL SECURITY;

-- RLS protects ordinary row DML, not TRUNCATE or trigger administration.
REVOKE ALL ON TABLE public.sales_price_lists, public.price_levels FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_price_lists, public.price_levels TO authenticated;
GRANT ALL ON TABLE public.sales_price_lists, public.price_levels TO service_role;

-- Keep existing organization.admin policies and add the pricing permission.
CREATE POLICY sales_price_lists_pricing_read ON public.sales_price_lists
  FOR SELECT TO authenticated
  USING (public.can_access_sales_pricing(organization_id, false));
CREATE POLICY sales_price_lists_pricing_manage ON public.sales_price_lists
  FOR ALL TO authenticated
  USING (public.can_access_sales_pricing(organization_id, true))
  WITH CHECK (public.can_access_sales_pricing(organization_id, true));

CREATE POLICY price_levels_pricing_read ON public.price_levels
  FOR SELECT TO authenticated
  USING (public.can_access_sales_pricing(organization_id, false));
CREATE POLICY price_levels_pricing_manage ON public.price_levels
  FOR ALL TO authenticated
  USING (public.can_access_sales_pricing(organization_id, true))
  WITH CHECK (public.can_access_sales_pricing(organization_id, true));

COMMIT;
