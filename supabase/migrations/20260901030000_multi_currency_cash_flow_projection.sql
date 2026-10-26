-- Multimodenda: separar USD y ARS en get_cash_flow_projection.
-- Agrega income_usd y expense_usd por semana.
--  - income: accounts_receivable.pending_balance por currency.
--  - expense: purchase_orders.total_amount por currency (sin exchange_rate,
--    se expone USD tal cual).
-- Los campos income/expense quedan como ARS (contract aditivo).
CREATE OR REPLACE FUNCTION public.get_cash_flow_projection(
  p_org_id uuid,
  p_weeks_lookahead integer DEFAULT 5,
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
  SELECT json_agg(week_row ORDER BY week_number)
  INTO v_result
  FROM (
    SELECT
      week_number,
      'Week ' || week_number as week,
      COALESCE(income_data.total, 0)::NUMERIC(15,2) as income,
      COALESCE(income_data.total_usd, 0)::NUMERIC(15,2) as income_usd,
      COALESCE(expense_data.total, 0)::NUMERIC(15,2) as expense,
      COALESCE(expense_data.total_usd, 0)::NUMERIC(15,2) as expense_usd
    FROM generate_series(1, p_weeks_lookahead) week_number
    CROSS JOIN LATERAL (
      SELECT
        CURRENT_DATE + ((week_number - 1) * 7) as week_start,
        CURRENT_DATE + (week_number * 7) - 1 as week_end
    ) week_bounds
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN currency = 'ARS' THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as total,
        SUM(CASE WHEN currency = 'USD' THEN pending_balance ELSE 0 END)::NUMERIC(15,2) as total_usd
      FROM accounts_receivable
      WHERE organization_id = p_org_id
        AND pending_balance > 0
        AND due_date BETWEEN week_bounds.week_start AND week_bounds.week_end
        AND (p_customer_id IS NULL OR customer_id = p_customer_id)
        AND p_supplier_id IS NULL
    ) income_data ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN currency = 'ARS' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total,
        SUM(CASE WHEN currency = 'USD' THEN total_amount ELSE 0 END)::NUMERIC(15,2) as total_usd
      FROM purchase_orders
      WHERE organization_id = p_org_id
        AND status IN ('ORDERED', 'IN_TRANSIT')
        AND expiration_date BETWEEN week_bounds.week_start AND week_bounds.week_end
        AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
        AND p_customer_id IS NULL
    ) expense_data ON true
  ) week_row;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$