-- Read and cleanup remain available when the feature is switched off.
BEGIN;

CREATE FUNCTION public.list_meli_payment_accounting_preparations(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid
) RETURNS TABLE (
  id uuid, draft_id uuid, status text, created_by uuid, created_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, components jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin boolean;
  v_warehouse_id uuid;
BEGIN
  v_admin := public.assert_meli_accounting_preparation_cleanup_access(p_org_id, p_actor_id);
  SELECT p.warehouse_id INTO v_warehouse_id
    FROM public.mercadolibre_payments p
    JOIN public.sales_orders s ON s.id = p.sales_order_id AND s.organization_id = p.organization_id
    WHERE p.id = p_payment_id AND p.organization_id = p_org_id
      AND s.sales_channel = 'MERCADO_LIBRE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro Meli no encontrado'; END IF;
  IF NOT v_admin THEN
    PERFORM 1 FROM public.warehouse_user_assignments
      WHERE organization_id = p_org_id AND user_id = p_actor_id AND warehouse_id = v_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Depósito no asignado al usuario' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT a.id, a.draft_id, a.status, a.created_by, a.created_at,
      a.cancelled_by, a.cancelled_at,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'key', c.component_key,
          'description', c.description,
          'amount', c.amount::text,
          'dispatchStatus', d.status,
          'journalEntryId', d.journal_entry_id
        ) ORDER BY c.component_key)
        FROM public.mercadolibre_accounting_payment_preparation_components c
        LEFT JOIN public.mercadolibre_accounting_payment_dispatches d
          ON d.preparation_id = c.preparation_id AND d.component_key = c.component_key
        WHERE c.preparation_id = a.id
      ), '[]'::jsonb)
    FROM public.mercadolibre_accounting_payment_preparations a
    WHERE a.organization_id = p_org_id AND a.payment_id = p_payment_id
    ORDER BY a.created_at DESC, a.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_meli_payment_accounting_preparations(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_meli_payment_accounting_preparations(uuid, uuid, uuid)
  TO service_role;
COMMIT;
