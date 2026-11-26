-- A sequence of partial notes must not reverse more of any fiscal category
-- than the authorized invoice contains.
BEGIN;

CREATE FUNCTION public.meli_fiscal_source_components(p_snapshot jsonb)
RETURNS TABLE (component_key text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_request jsonb;
  v_item jsonb;
  v_pair record;
  v_value text;
  v_id text;
  v_description text;
BEGIN
  v_request := p_snapshot->'request'->'wsfeRequest';
  IF jsonb_typeof(v_request) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'El snapshot fiscal requiere revisión';
  END IF;
  FOR v_pair IN SELECT * FROM (VALUES
    ('net', 'ImpNeto'), ('exempt', 'ImpOpEx'), ('nonTaxable', 'ImpTotConc')
  ) AS fields(key, field)
  LOOP
    v_value := v_request->>v_pair.field;
    IF coalesce(v_value, '') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Importe fiscal inválido para conciliación';
    END IF;
    component_key := v_pair.key;
    amount := v_value::numeric;
    RETURN NEXT;
  END LOOP;
  FOR v_pair IN SELECT * FROM (VALUES ('vat', 'Iva'), ('tribute', 'Tributos'))
    AS fields(key, field)
  LOOP
    IF v_request ? v_pair.field
      AND jsonb_typeof(v_request->v_pair.field) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Detalle fiscal inválido para conciliación';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(
      coalesce(v_request->v_pair.field, '[]'::jsonb))
    LOOP
      v_id := v_item->>'Id';
      v_value := v_item->>'Importe';
      v_description := btrim(v_item->>'Desc');
      IF coalesce(v_id, '') !~ '^[1-9][0-9]*$'
        OR coalesce(v_value, '') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        OR (v_pair.key = 'tribute' AND coalesce(v_description, '') = '') THEN
        RAISE EXCEPTION 'Detalle fiscal inválido para conciliación';
      END IF;
      component_key := v_pair.key || ':' || v_id;
      IF v_pair.key = 'tribute' THEN
        component_key := component_key || ':' || v_description;
      END IF;
      amount := v_value::numeric;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

CREATE FUNCTION public.guard_meli_credit_note_fiscal_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_preparation public.mercadolibre_fiscal_accounting_preparations%ROWTYPE;
  v_invoice_snapshot jsonb;
BEGIN
  SELECT * INTO v_preparation FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = NEW.preparation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparación fiscal no encontrada'; END IF;
  IF v_preparation.origin_type <> 'creditNote' THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.sales_orders s
    WHERE s.organization_id = v_preparation.organization_id
      AND s.id = v_preparation.sale_id AND s.sales_channel = 'MERCADO_LIBRE'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta Meli no encontrada'; END IF;
  SELECT f.source_snapshot INTO v_invoice_snapshot
    FROM public.mercadolibre_fiscal_accounting_preparations f
    JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
    WHERE f.organization_id = v_preparation.organization_id
      AND f.sale_id = v_preparation.sale_id AND f.origin_type = 'invoice'
      AND f.origin_id = v_preparation.sale_id AND d.status = 'PUBLISHED';
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura contabilizada no encontrada'; END IF;
  IF EXISTS (
    WITH invoice AS (
      SELECT component_key, sum(amount) AS total
      FROM public.meli_fiscal_source_components(v_invoice_snapshot)
      GROUP BY component_key
    ), notes AS (
      SELECT c.component_key, c.amount
      FROM public.mercadolibre_fiscal_accounting_preparations f
      JOIN public.mercadolibre_fiscal_accounting_dispatches d ON d.preparation_id = f.id
      CROSS JOIN LATERAL public.meli_fiscal_source_components(f.source_snapshot) c
      WHERE f.organization_id = v_preparation.organization_id
        AND f.sale_id = v_preparation.sale_id AND f.origin_type = 'creditNote'
      UNION ALL
      SELECT c.component_key, c.amount
      FROM public.meli_fiscal_source_components(v_preparation.source_snapshot) c
    ), used AS (
      SELECT component_key, sum(amount) AS total FROM notes GROUP BY component_key
    )
    SELECT 1 FROM used u LEFT JOIN invoice i USING (component_key)
      WHERE u.total > coalesce(i.total, 0)
  ) THEN
    RAISE EXCEPTION 'Las notas exceden un concepto fiscal de la factura; requiere revisión';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER z_meli_credit_note_fiscal_capacity
  BEFORE INSERT ON public.mercadolibre_fiscal_accounting_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_meli_credit_note_fiscal_capacity();

REVOKE ALL ON FUNCTION public.meli_fiscal_source_components(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_meli_credit_note_fiscal_capacity()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
