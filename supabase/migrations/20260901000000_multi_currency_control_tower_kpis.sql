-- Multimondeda: separar ventas/compras USD y ARS en get_control_tower_kpis.
-- Agrega sales.totalAmountUSD y purchases.pendingUSD_AMOUNT (monto en USD de
-- Purchase Orders en ORDERED/IN_TRANSIT). Los campos existentes se mantienen
-- como ARS (contract aditivo, no rompe la app previa).
--
-- Brecha de datos: purchase_orders no tiene exchange_rate, por lo que el
-- monto USD de compras se expone tal cual (sin conversión a ARS).
CREATE OR REPLACE FUNCTION public.get_control_tower_kpis(
  p_org_id uuid,
  p_start_date date,
  p_end_date date,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_supplier_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'sales', json_build_object(
      'totalAmount', COALESCE(sales_data.total_amount, 0),
      'totalAmountUSD', COALESCE(sales_data.total_amount_usd, 0),
      'totalOrders', COALESCE(sales_data.order_count, 0)
    ),
    'orders', json_build_object(
      'total', COALESCE(order_data.total, 0),
      'delivered', COALESCE(order_data.delivered, 0),
      'pending', COALESCE(order_data.pending, 0),
      'delayed', COALESCE(order_data.delayed, 0)
    ),
    'purchases', json_build_object(
      'pending', COALESCE(purchase_data.pending, 0),
      'pendingUSD_AMOUNT', COALESCE(purchase_data.pending_usd_amount, 0)
    ),
    'stock', json_build_object(
      'critical', COALESCE(stock_data.critical, 0)
    ),
    'customers', json_build_object(
      'active', COALESCE(customer_data.active, 0),
      'inactive', COALESCE(customer_data.inactive, 0)
    )
  ) INTO v_result
  FROM (
    SELECT
      SUM(CASE WHEN currency = 'ARS' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total_amount,
      SUM(CASE WHEN currency = 'USD' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total_amount_usd,
      COUNT(*)::INTEGER as order_count
    FROM sales_orders
    WHERE organization_id = p_org_id
      AND sale_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('DRAFT', 'CANCELLED')
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
      AND is_historical = false
  ) sales_data,
  (
    SELECT
      COUNT(*)::INTEGER as total,
      COUNT(*) FILTER (WHERE status = 'DELIVERED')::INTEGER as delivered,
      COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DISPATCH'))::INTEGER as pending,
      COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DISPATCH') AND sale_date < CURRENT_DATE - INTERVAL '3 days')::INTEGER as delayed
    FROM sales_orders
    WHERE organization_id = p_org_id
      AND sale_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('DRAFT', 'CANCELLED')
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
      AND is_historical = false
  ) order_data,
  (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('ORDERED', 'IN_TRANSIT'))::INTEGER as pending,
      SUM(CASE WHEN currency = 'USD' THEN total_amount ELSE 0 END) FILTER (WHERE status IN ('ORDERED', 'IN_TRANSIT'))::NUMERIC(15,2) as pending_usd_amount
    FROM purchase_orders
    WHERE organization_id = p_org_id
      AND status IN ('ORDERED', 'IN_TRANSIT')
      AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
  ) purchase_data,
  (
    SELECT
      COUNT(*)::INTEGER as critical
    FROM products p
    LEFT JOIN (
        SELECT product_id, SUM(quantity_available) as total_qty
        FROM product_lots WHERE organization_id = p_org_id GROUP BY product_id
    ) pl ON pl.product_id = p.id
    WHERE p.organization_id = p_org_id
      AND p.is_active = true
      AND COALESCE(pl.total_qty, 0) <= COALESCE(p.min_stock, 0)
      AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
  ) stock_data,
  (
    SELECT
      COUNT(DISTINCT customer_id)::INTEGER as active,
      (SELECT COUNT(*) FROM customers c2 WHERE c2.organization_id = p_org_id AND c2.is_active = true) - COUNT(DISTINCT customer_id)::INTEGER as inactive
    FROM sales_orders
    WHERE organization_id = p_org_id
      AND sale_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('DRAFT', 'CANCELLED')
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
      AND is_historical = false
  ) customer_data;

  RETURN v_result;
END;
$function$