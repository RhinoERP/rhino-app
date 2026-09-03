-- Multimondeda: separar USD y ARS en get_financial_balance.
-- Agrega variantes *USD para invoiced/collected/toCollect/toPay, aging.*USD y
-- margin.amountUSD. Los campos existentes quedan como ARS (contract aditivo).
--
-- Reglas:
--  - invoiced: sales_orders.total_amount por currency (rate congelado).
--  - collected: receivable_payments.amount para ARS y para USD se usa amount
--    (el bucket USD). Nota: la tabla tiene amount_ars para el convertido, pero
--    al separar por moneda exponemos amount USD directo.
--  - toCollect / aging: accounts_receivable.pending_balance por currency.
--  - toPay: purchase_orders.total_amount por currency (sin exchange_rate, se
--    expone USD tal cual).
--  - margin: sales_order_items.subtotal y costo por currency de la venta.
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
      AND (p_customer_id IS NULL OR so.customer_id = p_customer_id)
      AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
  ) margin_data;

  RETURN v_result;
END;
$function$