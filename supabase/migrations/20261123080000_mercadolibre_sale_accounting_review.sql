-- Read-only operational snapshot. This is not a reconciliation or a write lock.
BEGIN;

CREATE FUNCTION public.get_meli_sale_accounting_review(
  p_org_id uuid, p_actor_id uuid, p_sale_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_sale public.sales_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_org_id IS NULL OR p_actor_id IS NULL OR p_sale_id IS NULL THEN
    RAISE EXCEPTION 'Datos de revisión contable inválidos' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
  SELECT * INTO v_sale FROM public.sales_orders
    WHERE id = p_sale_id AND organization_id = p_org_id
      AND sales_channel = 'MERCADO_LIBRE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments
      WHERE organization_id = p_org_id AND user_id = p_actor_id AND warehouse_id = v_sale.warehouse_id
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT jsonb_build_object(
    'saleId', s.id, 'currency', s.currency, 'amount', s.total_amount::text,
    'invoiceStatus', s.arca_status,
    'notes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'amount', n.amount::text, 'currency', n.currency,
        'status', n.status, 'fiscalStatus', n.arca_status
      ) ORDER BY n.id)
      FROM (
        SELECT id, amount, currency, status, arca_status
        FROM public.credit_notes
        WHERE organization_id = p_org_id AND sales_order_id = p_sale_id
          AND sales_channel = 'MERCADO_LIBRE'
        ORDER BY id LIMIT 201
      ) n
    ), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount::text, 'currency', p.currency,
        'status', p.status
      ) ORDER BY p.id)
      FROM (
        SELECT id, amount, currency, status
        FROM public.mercadolibre_payments
        WHERE organization_id = p_org_id AND sales_order_id = p_sale_id
        ORDER BY id LIMIT 201
      ) p
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.sales_orders s
  WHERE s.id = p_sale_id AND s.organization_id = p_org_id
    AND s.sales_channel = 'MERCADO_LIBRE';
  IF v_result IS NULL THEN RAISE EXCEPTION 'La venta cambió durante la consulta'; END IF;
  IF jsonb_array_length(v_result->'notes') > 200 OR
    jsonb_array_length(v_result->'payments') > 200 THEN
    RAISE EXCEPTION 'La venta excede el límite de revisión individual; requiere revisión manual';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_meli_sale_accounting_review(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meli_sale_accounting_review(uuid, uuid, uuid) TO service_role;
COMMIT;
