-- Multimodenda: separar USD y ARS en get_top_performers.
-- Agrega total_amount_usd en topClients y topProducts. Los campos existentes
-- quedan como ARS (contract aditivo). El ranking se ordena por total_amount
-- (ARS) dentro de la lista; la UI separa por moneda.
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
$function$