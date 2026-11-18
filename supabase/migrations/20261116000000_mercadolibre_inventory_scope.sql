-- Replace the legacy SKU-based Meli inventory scope with the configured warehouse.
BEGIN;

UPDATE public.permissions SET description = 'Consultar ventas Mercado Libre e inventario de su depósito configurado'
  WHERE key = 'mercadolibre.access';

CREATE OR REPLACE FUNCTION public.get_inventory_stock_read_context(p_org_id uuid)
RETURNS TABLE (can_read_inventory boolean, can_read_mercadolibre boolean, can_view_costs boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN (
      'organization.admin', 'inventory.read', 'inventory.read.all', 'inventory.manage'
    )), false),
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN (
      'organization.admin', 'mercadolibre.access', 'mercadolibre.manage', 'mercadolibre.invoice'
    )), false),
    coalesce(m.is_owner, false) OR coalesce(bool_or(p.key IN (
      'organization.admin', 'inventory.manage'
    )), false)
  FROM public.organization_members m
  LEFT JOIN public.roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  LEFT JOIN public.permissions p ON p.id = rp.permission_id
  WHERE m.organization_id = p_org_id AND m.user_id = (SELECT auth.uid()) AND m.is_active
  GROUP BY m.is_owner;
$$;

-- Definer only for permission/config metadata. Stock remains an invoker/RLS read.
CREATE FUNCTION public.resolve_inventory_stock_warehouse(p_org_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_access record; v_warehouse uuid;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Organización inválida';
  END IF;
  SELECT * INTO v_access FROM public.get_inventory_stock_read_context(p_org_id);
  IF NOT FOUND OR NOT (v_access.can_read_inventory OR v_access.can_read_mercadolibre) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para consultar inventario';
  END IF;
  IF v_access.can_read_inventory THEN
    v_warehouse := p_warehouse_id;
  ELSE
    SELECT s.warehouse_id INTO v_warehouse
      FROM public.mercadolibre_settings s JOIN public.warehouses w
        ON w.id = s.warehouse_id AND w.organization_id = s.organization_id
      WHERE s.organization_id = p_org_id AND w.is_active AND w.direct_sale_enabled;
    IF v_warehouse IS NULL OR (p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_warehouse) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Consultá el depósito configurado para Mercado Libre';
    END IF;
  END IF;
  IF v_warehouse IS NOT NULL AND NOT public.can_access_warehouse(p_org_id, v_warehouse) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Depósito no disponible para tu usuario';
  END IF;
  RETURN v_warehouse;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_inventory_stock_warehouse(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_inventory_stock_warehouse(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_inventory_stock_balances(
  p_org_id uuid, p_product_ids uuid[], p_warehouse_id uuid DEFAULT NULL
) RETURNS TABLE (product_id uuid, quantity_available numeric, unit_quantity_available numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
SET plan_cache_mode = force_custom_plan AS $$
DECLARE v_warehouse uuid;
BEGIN
  v_warehouse := public.resolve_inventory_stock_warehouse(p_org_id, p_warehouse_id);
  IF cardinality(p_product_ids) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Consultá hasta 1000 productos por bloque';
  END IF;
  RETURN QUERY
  WITH scoped_products AS MATERIALIZED (
    SELECT p.id, coalesce(p.has_variants, false) AS has_variants FROM public.products p
      WHERE p.organization_id = p_org_id AND (p_product_ids IS NULL OR p.id = ANY(p_product_ids))
  ), balances AS (
    SELECT pl.product_id, sum(pl.quantity_available) AS quantity,
      sum(coalesce(pl.unit_quantity_available, 0)) AS units
    FROM public.product_lots pl JOIN scoped_products p ON p.id = pl.product_id
    LEFT JOIN public.product_variants pv ON pv.id = pl.product_variant_id
      AND pv.organization_id = p_org_id AND pv.product_id = pl.product_id
    WHERE pl.organization_id = p_org_id
      AND (v_warehouse IS NULL OR pl.warehouse_id = v_warehouse)
      AND (NOT p.has_variants OR pv.is_active = true)
    GROUP BY pl.product_id
  ) SELECT p.id, coalesce(b.quantity, 0)::numeric, coalesce(b.units, 0)::numeric
      FROM scoped_products p LEFT JOIN balances b ON b.product_id = p.id;
END;
$$;

-- Same currency-aware metrics as 20261106000000, with effective warehouse scope.
CREATE OR REPLACE FUNCTION public.get_inventory_stock_metrics(p_org_id uuid, p_warehouse_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
SET plan_cache_mode = force_custom_plan AS $$
DECLARE v_access record; v_result jsonb; v_warehouse uuid;
BEGIN
  v_warehouse := public.resolve_inventory_stock_warehouse(p_org_id, p_warehouse_id);
  SELECT * INTO v_access FROM public.get_inventory_stock_read_context(p_org_id);
  WITH stock AS MATERIALIZED (
    SELECT p.id, p.is_active, p.min_stock, p.unit_of_measure::text AS unit_of_measure,
      b.quantity_available AS quantity
    FROM public.get_inventory_stock_balances(p_org_id, NULL::uuid[], v_warehouse) b
    JOIN public.products p ON p.id = b.product_id AND p.organization_id = p_org_id
  ), priced AS (
    SELECT s.*, price.cost_price, price.currency FROM stock s
    LEFT JOIN LATERAL (
      SELECT pw.cost_price, pw.currency FROM public.products_with_price pw
      WHERE v_access.can_view_costs AND s.is_active AND s.quantity > 0
        AND pw.organization_id = p_org_id AND pw.id = s.id
    ) price ON true
  ) SELECT jsonb_build_object(
    'warehouseScoped', v_warehouse IS NOT NULL,
    'canViewCosts', v_access.can_view_costs,
    'totalProducts', count(*) FILTER (WHERE v_warehouse IS NULL OR s.quantity > 0),
    'activeProducts', count(*) FILTER (WHERE s.is_active AND (v_warehouse IS NULL OR s.quantity > 0)),
    'inactiveProducts', count(*) FILTER (WHERE NOT s.is_active AND (v_warehouse IS NULL OR s.quantity > 0)),
    'totalUnits', coalesce(sum(s.quantity) FILTER (WHERE s.is_active AND s.quantity > 0
      AND coalesce(s.unit_of_measure, '') NOT IN ('KG', 'LT')), 0),
    'totalKg', round(coalesce(sum(s.quantity) FILTER (WHERE s.is_active AND s.quantity > 0 AND s.unit_of_measure = 'KG'), 0), 1),
    'totalLt', round(coalesce(sum(s.quantity) FILTER (WHERE s.is_active AND s.quantity > 0 AND s.unit_of_measure = 'LT'), 0), 1),
    'lowStockCount', count(*) FILTER (WHERE s.is_active AND s.quantity > 0 AND s.quantity <= s.min_stock)
  ) || CASE WHEN v_access.can_view_costs THEN jsonb_build_object(
    'totalStockValue', coalesce(sum(s.quantity * s.cost_price) FILTER (WHERE s.is_active AND s.quantity > 0 AND s.currency = 'ARS'), 0),
    'totalStockValueUsd', coalesce(sum(s.quantity * s.cost_price) FILTER (WHERE s.is_active AND s.quantity > 0 AND s.currency = 'USD'), 0),
    'unpricedStockProducts', count(*) FILTER (WHERE s.is_active AND s.quantity > 0
      AND (s.cost_price IS NULL OR s.currency IS NULL OR s.currency NOT IN ('ARS', 'USD')))
  ) ELSE '{}'::jsonb END INTO v_result FROM priced s;
  RETURN v_result;
END;
$$;

COMMIT;
