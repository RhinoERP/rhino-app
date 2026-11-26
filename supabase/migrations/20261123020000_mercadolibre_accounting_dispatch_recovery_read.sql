-- Server-only recovery read. It does not enable dispatch or confirmation.
BEGIN;

CREATE FUNCTION public.get_meli_payment_dispatch_for_recovery(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid,
  p_preparation_id uuid, p_component_key text
) RETURNS TABLE (
  request_key uuid, request_payload jsonb, dispatch_status text,
  journal_entry_id uuid, initiated_by uuid, initiated_at timestamptz,
  published_by uuid, published_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_warehouse_id uuid;
BEGIN
  IF p_payment_id IS NULL OR p_preparation_id IS NULL
    OR p_component_key IS NULL OR length(p_component_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Datos de recuperación contable inválidos' USING ERRCODE = '22023';
  END IF;
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
  SELECT p.warehouse_id INTO v_warehouse_id
    FROM public.mercadolibre_payments p
    JOIN public.sales_orders s ON s.id = p.sales_order_id AND s.organization_id = p.organization_id
    JOIN public.mercadolibre_accounting_payment_preparations a
      ON a.payment_id = p.id AND a.organization_id = p.organization_id
    WHERE p.id = p_payment_id AND p.organization_id = p_org_id
      AND a.id = p_preparation_id AND s.sales_channel = 'MERCADO_LIBRE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación contable no encontrada'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments
      WHERE organization_id = p_org_id AND user_id = p_actor_id AND warehouse_id = v_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM 1 FROM public.mercadolibre_accounting_payment_preparation_components c
    WHERE c.preparation_id = p_preparation_id AND c.component_key = p_component_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Componente contable no encontrado'; END IF;
  RETURN QUERY
    SELECT d.request_key, d.request_payload, d.status, d.journal_entry_id,
      d.initiated_by, d.initiated_at, d.published_by, d.published_at
    FROM public.mercadolibre_accounting_payment_dispatches d
    WHERE d.preparation_id = p_preparation_id AND d.component_key = p_component_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_meli_payment_dispatch_for_recovery(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meli_payment_dispatch_for_recovery(uuid, uuid, uuid, uuid, text)
  TO service_role;
COMMIT;
