-- Read-only source data for reviewing an existing dispatch.
BEGIN;

CREATE FUNCTION public.get_meli_payment_dispatch_source(
  p_org_id uuid, p_actor_id uuid, p_payment_id uuid,
  p_preparation_id uuid, p_component_key text
) RETURNS TABLE (
  sale_id uuid, payment_date date, currency text, payment_status text,
  preparation_status text, component_amount text,
  debit_account jsonb, credit_account jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.get_meli_payment_dispatch_for_recovery(
    p_org_id, p_actor_id, p_payment_id, p_preparation_id, p_component_key);
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.sales_order_id, p.payment_date, p.currency, p.status,
      a.status, c.amount::text, c.debit_account, c.credit_account
    FROM public.mercadolibre_payments p
    JOIN public.mercadolibre_accounting_payment_preparations a
      ON a.payment_id = p.id AND a.organization_id = p.organization_id
    JOIN public.mercadolibre_accounting_payment_preparation_components c
      ON c.preparation_id = a.id
    WHERE p.id = p_payment_id AND p.organization_id = p_org_id
      AND a.id = p_preparation_id AND c.component_key = p_component_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_meli_payment_dispatch_source(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meli_payment_dispatch_source(uuid, uuid, uuid, uuid, text)
  TO service_role;
COMMIT;
