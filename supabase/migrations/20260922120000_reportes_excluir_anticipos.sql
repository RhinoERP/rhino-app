-- Reportes financieros: excluir documentos fiscales ADVANCE/BALANCE de las
-- métricas de "ventas".
--
-- Un anticipo (formal o informal) crea un documento sales_orders con
-- document_type = 'ADVANCE' (y el saldo formal crea 'BALANCE'). La venta real
-- (STANDARD) conserva el total completo. Por eso contar ADVANCE/BALANCE como
-- "venta" infla la facturación, el margen, los pedidos y los top clientes.
--
-- Regla: en los reportes de VENTAS/FACTURACIÓN/MARGEN/PEDIDOS/TOP-CLIENTES se
-- cuenta SOLO document_type = 'STANDARD'. Las cobranzas y balances siguen
-- usando accounts_receivable (el anticipo cobrado sí es un ingreso real).

-- ---------------------------------------------------------------------------
-- get_financial_balance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_balance(
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
    'invoiced', COALESCE(invoiced_data.total, 0),
    'invoicedUSD', COALESCE(invoiced_data.total_usd, 0),
    'collected', COALESCE(collected_data.total, 0),
    'collectedUSD', COALESCE(collected_data.total_usd, 0),
    'toCollect', COALESCE(to_collect_data.total, 0),
    'toCollectUSD', COALESCE(to_collect_data.total_usd, 0),
    'toPay', COALESCE(to_pay_data.total, 0),
    'toPayUSD', COALESCE(to_pay_data.total_usd, 0),
    'aging', json_build_object(
      'days1_7', COALESCE(aging_data.days1_7, 0),
      'days1_7USD', COALESCE(aging_data.days1_7_usd, 0),
      'days8_14', COALESCE(aging_data.days8_14, 0),
      'days8_14USD', COALESCE(aging_data.days8_14_usd, 0),
      'days15_30', COALESCE(aging_data.days15_30, 0),
      'days15_30USD', COALESCE(aging_data.days15_30_usd, 0),
      'days31_60', COALESCE(aging_data.days31_60, 0),
      'days31_60USD', COALESCE(aging_data.days31_60_usd, 0),
      'over60', COALESCE(aging_data.over60, 0),
      'over60USD', COALESCE(aging_data.over60_usd, 0)
    ),
    'margin', json_build_object(
      'amount', COALESCE(margin_data.amount, 0),
      'amountUSD', COALESCE(margin_data.amount_usd, 0),
      'percentage', COALESCE(margin_data.percentage, 0)
    )
  ) INTO v_result
  FROM (
    SELECT
      SUM(CASE WHEN currency = 'ARS' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total,
      SUM(CASE WHEN currency = 'USD' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total_usd
    FROM sales_orders
    WHERE organization_id = p_org_id
      AND sale_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('DRAFT', 'CANCELLED')
      AND is_historical = false
      AND document_type = 'STANDARD'
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
  ) invoiced_data,
  (
    SELECT
      SUM(CASE WHEN rp.currency = 'ARS' THEN rp.amount ELSE 0 END)::NUMERIC(15,2) as total,
      SUM(CASE WHEN rp.currency = 'USD' THEN rp.amount ELSE 0 END)::NUMERIC(15,2) as total_usd
    FROM receivable_payments rp
    INNER JOIN accounts_receivable ar ON ar.id = rp.account_receivable_id
    WHERE ar.organization_id = p_org_id
      AND rp.payment_date BETWEEN p_start_date AND p_end_date
      AND (p_customer_id IS NULL OR ar.customer_id = p_customer_id)
  ) collected_data,
  (
    SELECT
      SUM(CASE WHEN currency = 'ARS' THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as total,
      SUM(CASE WHEN currency = 'USD' THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as total_usd
    FROM accounts_receivable
    WHERE organization_id = p_org_id
      AND pending_balance > 0
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
  ) to_collect_data,
  (
    SELECT
      SUM(CASE WHEN currency = 'ARS' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total,
      SUM(CASE WHEN currency = 'USD' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total_usd
    FROM purchase_orders
    WHERE organization_id = p_org_id
      AND status IN ('ORDERED', 'IN_TRANSIT')
      AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
      AND p_customer_id IS NULL
  ) to_pay_data,
  (
    SELECT
      SUM(CASE WHEN currency = 'ARS' AND (CURRENT_DATE - due_date) BETWEEN 0 AND 7  THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days1_7,
      SUM(CASE WHEN currency = 'USD' AND (CURRENT_DATE - due_date) BETWEEN 0 AND 7  THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days1_7_usd,
      SUM(CASE WHEN currency = 'ARS' AND (CURRENT_DATE - due_date) BETWEEN 8 AND 14 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days8_14,
      SUM(CASE WHEN currency = 'USD' AND (CURRENT_DATE - due_date) BETWEEN 8 AND 14 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days8_14_usd,
      SUM(CASE WHEN currency = 'ARS' AND (CURRENT_DATE - due_date) BETWEEN 15 AND 30 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days15_30,
      SUM(CASE WHEN currency = 'USD' AND (CURRENT_DATE - due_date) BETWEEN 15 AND 30 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days15_30_usd,
      SUM(CASE WHEN currency = 'ARS' AND (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days31_60,
      SUM(CASE WHEN currency = 'USD' AND (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as days31_60_usd,
      SUM(CASE WHEN currency = 'ARS' AND (CURRENT_DATE - due_date) > 60 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as over60,
      SUM(CASE WHEN currency = 'USD' AND (CURRENT_DATE - due_date) > 60 THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as over60_usd
    FROM accounts_receivable
    WHERE organization_id = p_org_id
      AND pending_balance > 0
      AND due_date <= CURRENT_DATE
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
  ) aging_data,
  (
    SELECT
      (SUM(CASE WHEN so.currency = 'ARS' THEN soi.subtotal ELSE 0 END) - SUM(CASE WHEN so.currency = 'ARS' THEN soi.quantity * COALESCE(pli.cost_price, 0) ELSE 0 END))::NUMERIC(15,2) as amount,
      (SUM(CASE WHEN so.currency = 'USD' THEN soi.subtotal ELSE 0 END) - SUM(CASE WHEN so.currency = 'USD' THEN soi.quantity * COALESCE(pli.cost_price, 0) ELSE 0 END))::NUMERIC(15,2) as amount_usd,
      CASE WHEN SUM(soi.subtotal) > 0
           THEN ((SUM(soi.subtotal) - SUM(soi.quantity * COALESCE(pli.cost_price, 0))) / SUM(soi.subtotal) * 100)::NUMERIC(8,4)
           ELSE 0 END as percentage
    FROM sales_order_items soi
    INNER JOIN sales_orders so ON so.id = soi.sales_order_id
    LEFT JOIN LATERAL (
        SELECT cost_price FROM price_list_items pli2
        JOIN price_lists pl ON pl.id = pli2.price_list_id
        WHERE pli2.product_id = soi.product_id AND pl.is_active = true
        ORDER BY pl.valid_from DESC LIMIT 1
    ) pli ON true
    LEFT JOIN products p ON p.id = soi.product_id
    WHERE so.organization_id = p_org_id
      AND so.sale_date BETWEEN p_start_date AND p_end_date
      AND so.status NOT IN ('DRAFT', 'CANCELLED')
      AND so.is_historical = false
      AND so.document_type = 'STANDARD'
      AND (p_customer_id IS NULL OR so.customer_id = p_customer_id)
      AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
  ) margin_data;

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_control_tower_kpis
-- ---------------------------------------------------------------------------
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
      AND document_type = 'STANDARD'
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
      AND document_type = 'STANDARD'
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
      AND document_type = 'STANDARD'
  ) customer_data;

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- get_top_performers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_performers(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'topClients', top_clients_data.clients,
    'topProducts', top_products_data.products
  ) INTO v_result
  FROM (
    SELECT COALESCE(json_agg(client_row ORDER BY total_amount DESC), '[]'::json) as clients
    FROM (
      SELECT
        c.id,
        c.business_name as name,
        SUM(CASE WHEN so.currency = 'ARS' THEN so.total_amount ELSE 0 END)::NUMERIC(15,2) as total_amount,
        SUM(CASE WHEN so.currency = 'USD' THEN so.total_amount ELSE 0 END)::NUMERIC(15,2) as total_amount_usd,
        COUNT(so.id)::INTEGER as order_count
      FROM customers c
      INNER JOIN sales_orders so ON so.customer_id = c.id
      WHERE c.organization_id = p_org_id
        AND so.sale_date BETWEEN p_start_date AND p_end_date
        AND so.status NOT IN ('DRAFT', 'CANCELLED')
        AND so.is_historical = false
        AND so.document_type = 'STANDARD'
      GROUP BY c.id, c.business_name
      ORDER BY total_amount DESC
      LIMIT 5
    ) client_row
  ) top_clients_data,
  (
    SELECT COALESCE(json_agg(product_row ORDER BY units_sold DESC), '[]'::json) as products
    FROM (
      SELECT
        p.id,
        p.name,
        p.sku,
        SUM(soi.quantity)::NUMERIC(15,2) as units_sold,
        SUM(CASE WHEN so.currency = 'ARS' THEN soi.subtotal ELSE 0 END)::NUMERIC(15,2) as total_amount,
        SUM(CASE WHEN so.currency = 'USD' THEN soi.subtotal ELSE 0 END)::NUMERIC(15,2) as total_amount_usd
      FROM products p
      INNER JOIN sales_order_items soi ON soi.product_id = p.id
      INNER JOIN sales_orders so ON so.id = soi.sales_order_id
      WHERE p.organization_id = p_org_id
        AND so.sale_date BETWEEN p_start_date AND p_end_date
        AND so.status NOT IN ('DRAFT', 'CANCELLED')
        AND so.is_historical = false
      GROUP BY p.id, p.name, p.sku
      ORDER BY units_sold DESC
      LIMIT 5
    ) product_row
  ) top_products_data;

  RETURN v_result;
END;
$function$;