-- Multimodenda: separar USD y ARS en get_profitability_metrics.
-- Cada fila se agrupa por (label, currency) de modo que cada fila queda en UNA
-- moneda. Se agregan columnas revenue_usd, profit_usd y currency.
--  - revenue / profit: valor en la moneda de la fila (currency).
--  - revenue_usd / profit_usd: 0 para filas ARS, el valor para filas USD
--    (espejo, comodidad para el render).
-- ranking: se ordena por profit DESC dentro de cada moneda (ranking por moneda
-- separado). El RETURN TABLE agregó revenue_usd/profit_usd/currency.
--
-- CREATE OR REPLACE no permite cambiar el tipo de retorno de una función
-- existente (PostgreSQL 42P13), así que se hace DROP explícito primero.
DROP FUNCTION IF EXISTS public.get_profitability_metrics(uuid, timestamp without time zone, timestamp without time zone, text);
CREATE OR REPLACE FUNCTION public.get_profitability_metrics(
  p_org_id uuid,
  p_date_from timestamp without time zone,
  p_date_to timestamp without time zone,
  p_group_by text
)
RETURNS TABLE(label text, revenue numeric, profit numeric, margin_percent numeric, order_count integer, revenue_usd numeric, profit_usd numeric, currency text)
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Validate group_by parameter
  IF p_group_by NOT IN ('CLIENT', 'BRAND', 'PRODUCT') THEN
    RAISE EXCEPTION 'Invalid p_group_by value. Must be CLIENT, BRAND, or PRODUCT';
  END IF;

  -- GROUP BY CLIENT
  IF p_group_by = 'CLIENT' THEN
    RETURN QUERY
    WITH sales_data AS (
      SELECT
        c.id AS group_id,
        COALESCE(c.business_name, c.fantasy_name, 'Sin nombre') AS group_label,
        COALESCE(so.currency, 'ARS') AS currency,
        SUM(soi.subtotal) AS total_revenue,
        SUM(
          COALESCE(
            soi.quantity * (
              SELECT poi.unit_cost
              FROM purchase_order_items poi
              INNER JOIN purchase_orders po ON poi.purchase_order_id = po.id
              WHERE poi.product_id = soi.product_id
                AND po.organization_id = p_org_id
                AND po.status = 'RECEIVED'
              ORDER BY po.purchase_date DESC
              LIMIT 1
            ),
            CASE
              WHEN p.profit_margin IS NOT NULL AND p.profit_margin > 0 THEN
                soi.subtotal / (1 + (p.profit_margin / 100))
              ELSE
                0
            END
          )
        ) AS total_cost,
        COUNT(DISTINCT so.id) AS total_orders
      FROM sales_orders so
      INNER JOIN sales_order_items soi ON so.id = soi.sales_order_id
      INNER JOIN products p ON soi.product_id = p.id
      INNER JOIN customers c ON so.customer_id = c.id
      WHERE
        so.organization_id = p_org_id
        AND so.status NOT IN ('DRAFT', 'CANCELLED')
        AND so.sale_date >= p_date_from
        AND so.sale_date <= p_date_to
        AND so.is_historical = false
      GROUP BY c.id, c.business_name, c.fantasy_name, COALESCE(so.currency, 'ARS')
    )
    SELECT
      sd.group_label::TEXT,
      ROUND(sd.total_revenue, 2),
      ROUND(sd.total_revenue - sd.total_cost, 2),
      ROUND(
        CASE
          WHEN sd.total_revenue > 0 THEN
            ((sd.total_revenue - sd.total_cost) / sd.total_revenue) * 100
          ELSE 0
        END,
        2
      ),
      sd.total_orders::INTEGER,
      ROUND(CASE WHEN sd.currency = 'USD' THEN sd.total_revenue ELSE 0 END, 2),
      ROUND(CASE WHEN sd.currency = 'USD' THEN sd.total_revenue - sd.total_cost ELSE 0 END, 2),
      sd.currency
    FROM sales_data sd
    WHERE sd.total_revenue > 0
    ORDER BY sd.currency, profit DESC
    LIMIT 10;

  -- GROUP BY BRAND
  ELSIF p_group_by = 'BRAND' THEN
    RETURN QUERY
    WITH sales_data AS (
      SELECT
        COALESCE(p.brand, 'Sin marca') AS group_label,
        COALESCE(so.currency, 'ARS') AS currency,
        SUM(soi.subtotal) AS total_revenue,
        SUM(
          COALESCE(
            soi.quantity * (
              SELECT poi.unit_cost
              FROM purchase_order_items poi
              INNER JOIN purchase_orders po ON poi.purchase_order_id = po.id
              WHERE poi.product_id = soi.product_id
                AND po.organization_id = p_org_id
                AND po.status = 'RECEIVED'
              ORDER BY po.purchase_date DESC
              LIMIT 1
            ),
            CASE
              WHEN p.profit_margin IS NOT NULL AND p.profit_margin > 0 THEN
                soi.subtotal / (1 + (p.profit_margin / 100))
              ELSE
                0
            END
          )
        ) AS total_cost,
        COUNT(DISTINCT so.id) AS total_orders
      FROM sales_orders so
      INNER JOIN sales_order_items soi ON so.id = soi.sales_order_id
      INNER JOIN products p ON soi.product_id = p.id
      WHERE
        so.organization_id = p_org_id
        AND so.status NOT IN ('DRAFT', 'CANCELLED')
        AND so.sale_date >= p_date_from
        AND so.sale_date <= p_date_to
        AND so.is_historical = false
      GROUP BY p.brand, COALESCE(so.currency, 'ARS')
    )
    SELECT
      sd.group_label::TEXT,
      ROUND(sd.total_revenue, 2),
      ROUND(sd.total_revenue - sd.total_cost, 2),
      ROUND(
        CASE
          WHEN sd.total_revenue > 0 THEN
            ((sd.total_revenue - sd.total_cost) / sd.total_revenue) * 100
          ELSE 0
        END,
        2
      ),
      sd.total_orders::INTEGER,
      ROUND(CASE WHEN sd.currency = 'USD' THEN sd.total_revenue ELSE 0 END, 2),
      ROUND(CASE WHEN sd.currency = 'USD' THEN sd.total_revenue - sd.total_cost ELSE 0 END, 2),
      sd.currency
    FROM sales_data sd
    WHERE sd.total_revenue > 0
    ORDER BY sd.currency, profit DESC
    LIMIT 10;

  -- GROUP BY PRODUCT
  ELSIF p_group_by = 'PRODUCT' THEN
    RETURN QUERY
    WITH sales_data AS (
      SELECT
        p.id AS group_id,
        p.name AS group_label,
        COALESCE(so.currency, 'ARS') AS currency,
        SUM(soi.subtotal) AS total_revenue,
        SUM(
          COALESCE(
            soi.quantity * (
              SELECT poi.unit_cost
              FROM purchase_order_items poi
              INNER JOIN purchase_orders po ON poi.purchase_order_id = po.id
              WHERE poi.product_id = soi.product_id
                AND po.organization_id = p_org_id
                AND po.status = 'RECEIVED'
              ORDER BY po.purchase_date DESC
              LIMIT 1
            ),
            CASE
              WHEN p.profit_margin IS NOT NULL AND p.profit_margin > 0 THEN
                soi.subtotal / (1 + (p.profit_margin / 100))
              ELSE
                0
            END
          )
        ) AS total_cost,
        COUNT(DISTINCT so.id) AS total_orders
      FROM sales_orders so
      INNER JOIN sales_order_items soi ON so.id = soi.sales_order_id
      INNER JOIN products p ON soi.product_id = p.id
      WHERE
        so.organization_id = p_org_id
        AND so.status NOT IN ('DRAFT', 'CANCELLED')
        AND so.sale_date >= p_date_from
        AND so.sale_date <= p_date_to
        AND so.is_historical = false
      GROUP BY p.id, p.name, COALESCE(so.currency, 'ARS')
    )
    SELECT
      sd.group_label::TEXT,
      ROUND(sd.total_revenue, 2),
      ROUND(sd.total_revenue - sd.total_cost, 2),
      ROUND(
        CASE
          WHEN sd.total_revenue > 0 THEN
            ((sd.total_revenue - sd.total_cost) / sd.total_revenue) * 100
          ELSE 0
        END,
        2
      ),
      sd.total_orders::INTEGER,
      ROUND(CASE WHEN sd.currency = 'USD' THEN sd.total_revenue ELSE 0 END, 2),
      ROUND(CASE WHEN sd.currency = 'USD' THEN sd.total_revenue - sd.total_cost ELSE 0 END, 2),
      sd.currency
    FROM sales_data sd
    WHERE sd.total_revenue > 0
    ORDER BY sd.currency, profit DESC
    LIMIT 10;

  END IF;
END;
$function$