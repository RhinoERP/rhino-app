-- La grilla obtiene el costo vigente de products_with_price (lista de compra
-- aplicable por producto). products no tiene cost_price: ambos RPC de margen
-- deben usar el mismo costo que muestra la grilla y que calcula la venta.

CREATE OR REPLACE FUNCTION public.update_product_profit_margin(
  p_org_id uuid,
  p_product_id uuid,
  p_margin numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No sos miembro de la organización';
  END IF;

  IF NOT public.user_has_org_permission('columns.view_margin', p_org_id)
     AND NOT public.user_has_org_permission('organization.admin', p_org_id)
     AND NOT public.user_has_org_permission('inventory.manage', p_org_id) THEN
    RAISE EXCEPTION 'No tenés permisos para editar el margen';
  END IF;

  SELECT cost_price INTO v_cost
  FROM public.products_with_price
  WHERE id = p_product_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF v_cost IS NULL OR v_cost <= 0 THEN
    RAISE EXCEPTION 'El producto no tiene un precio de costo asignado';
  END IF;

  IF p_margin IS NULL OR p_margin < 0 THEN
    RAISE EXCEPTION 'El margen debe ser mayor o igual a 0';
  END IF;

  UPDATE public.products
  SET profit_margin = p_margin,
      updated_at = now()
  WHERE id = p_product_id AND organization_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_product_profit_margin(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_product_profit_margin(uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_direct_sale_price_for_margin(
  p_org_id uuid,
  p_product_id uuid,
  p_margin numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
  v_price numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No sos miembro de la organización';
  END IF;

  IF NOT public.user_has_org_permission('columns.view_margin', p_org_id)
     AND NOT public.user_has_org_permission('organization.admin', p_org_id)
     AND NOT public.user_has_org_permission('inventory.manage', p_org_id) THEN
    RAISE EXCEPTION 'No tenés permisos para editar el margen';
  END IF;

  SELECT cost_price INTO v_cost
  FROM public.products_with_price
  WHERE id = p_product_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF v_cost IS NULL OR v_cost <= 0 THEN
    RAISE EXCEPTION 'El producto no tiene un precio de costo asignado';
  END IF;

  IF p_margin IS NULL OR p_margin < 0 THEN
    RAISE EXCEPTION 'El margen debe ser mayor o igual a 0';
  END IF;

  v_price := round(v_cost * (1 + p_margin / 100.0), 2);

  INSERT INTO public.direct_sale_prices (organization_id, product_id, price, updated_at)
  VALUES (p_org_id, p_product_id, v_price, now())
  ON CONFLICT (organization_id, product_id)
  DO UPDATE SET price = EXCLUDED.price, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_direct_sale_price_for_margin(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_direct_sale_price_for_margin(uuid, uuid, numeric) TO authenticated;
