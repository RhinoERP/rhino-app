-- Coordinate Meli reservations with the application's other fiscal writers.
-- Metadata stays in the existing arca_request_json; no generated type changes.
BEGIN;
CREATE FUNCTION public.guard_meli_fiscal_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW); v_old jsonb; v_request jsonb;
  v_state text; v_is_meli boolean; v_point text; v_type text; v_number text;
  v_table text; v_row jsonb; v_other_request jsonb; v_other_state text; v_status_column text;
BEGIN
  v_state := coalesce(v_new->>'arca_status', v_new->>'status');
  IF v_state NOT IN ('pending', 'verifying') THEN RETURN NEW; END IF;
  v_request := v_new->'arca_request_json'->'wsfeRequest';
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF coalesce(v_old->>'arca_status', v_old->>'status') IN ('pending', 'verifying') THEN
      IF v_new->>'sales_channel' = 'MERCADO_LIBRE'
        AND v_request IS DISTINCT FROM v_old->'arca_request_json'->'wsfeRequest' THEN
        RAISE EXCEPTION 'No se puede reemplazar la solicitud de una emisión Meli pendiente';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  v_is_meli := coalesce(v_new->>'sales_channel' = 'MERCADO_LIBRE', false);
  v_point := v_request->>'PtoVta'; v_type := v_request->>'CbteTipo';
  v_number := v_request->>'CbteDesde';
  IF v_is_meli AND (v_number IS NULL OR v_number IS DISTINCT FROM v_request->>'CbteHasta') THEN
    RAISE EXCEPTION 'La emisión Meli debe reservar un número fiscal antes de enviar a ARCA';
  END IF;
  IF v_point IS NULL OR v_type IS NULL THEN
    IF v_is_meli THEN RAISE EXCEPTION 'Falta la identidad fiscal de la reserva Meli'; END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'meli-fiscal:' || (v_new->>'organization_id') || ':' || v_point || ':' || v_type, 0
  ));
  FOREACH v_table IN ARRAY ARRAY['sales_orders', 'credit_notes', 'pos_sales', 'manual_fiscal_invoices', 'debit_notes'] LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NULL THEN CONTINUE; END IF;
    v_status_column := CASE WHEN v_table IN ('manual_fiscal_invoices', 'debit_notes') THEN 'status' ELSE 'arca_status' END;
    FOR v_row IN EXECUTE pg_catalog.format(
      'SELECT to_jsonb(d) FROM public.%I d WHERE organization_id = $1 AND
        (d.%I IN (''pending'', ''verifying'') OR ($2 AND d.%I = ''authorized''
          AND arca_point_of_sale = $3::integer AND arca_voucher_type_code = $4::integer
          AND arca_voucher_number = $5::integer))', v_table, v_status_column, v_status_column
    ) USING (v_new->>'organization_id')::uuid, v_is_meli, v_point, v_type, v_number LOOP
      IF v_table = TG_TABLE_NAME AND v_row->>'id' = v_new->>'id' THEN CONTINUE; END IF;
      v_other_state := coalesce(v_row->>'arca_status', v_row->>'status');
      v_other_request := v_row->'arca_request_json'->'wsfeRequest';
      IF v_is_meli AND v_other_state = 'authorized'
        AND v_row->>'arca_point_of_sale' = v_point AND v_row->>'arca_voucher_type_code' = v_type
        AND v_row->>'arca_voucher_number' = v_number THEN
        RAISE EXCEPTION 'El número fiscal ya fue utilizado. Volvé a intentar para consultar la numeración actual';
      END IF;
      IF v_is_meli AND v_other_state IN ('pending', 'verifying')
        AND (v_other_request->>'PtoVta' IS NULL OR v_other_request->>'CbteTipo' IS NULL) THEN
        RAISE EXCEPTION 'Hay una emisión pendiente sin identidad fiscal completa. Revisala antes de emitir Meli';
      END IF;
      IF v_other_request->>'PtoVta' IS DISTINCT FROM v_point
        OR v_other_request->>'CbteTipo' IS DISTINCT FROM v_type THEN CONTINUE; END IF;
      IF v_other_state IN ('pending', 'verifying') AND
        (v_is_meli OR v_row->>'sales_channel' = 'MERCADO_LIBRE') THEN
        RAISE EXCEPTION 'Hay una emisión fiscal pendiente para este punto de venta y tipo. Conciliá ese intento antes de emitir otro';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['sales_orders', 'credit_notes', 'pos_sales', 'manual_fiscal_invoices', 'debit_notes'] LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE pg_catalog.format('CREATE TRIGGER meli_fiscal_reservation_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_meli_fiscal_reservation()', v_table);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_meli_fiscal_reservation() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
