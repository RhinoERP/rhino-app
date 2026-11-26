-- Empty disposable PostgreSQL instance only: creates roles and fixtures.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY, organization_id uuid, warehouse_id uuid, sales_channel text,
  currency text, total_amount numeric, arca_status text
);
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY, organization_id uuid, sales_order_id uuid, sales_channel text,
  currency text, amount numeric, status text, arca_status text
);
CREATE TABLE public.mercadolibre_payments (
  id uuid PRIMARY KEY, organization_id uuid, sales_order_id uuid,
  currency text, amount numeric, status text
);
CREATE TABLE public.warehouse_user_assignments (
  organization_id uuid, user_id uuid, warehouse_id uuid
);
CREATE FUNCTION public.assert_meli_accounting_preparation_cleanup_access(uuid, uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF $1 = md5('org')::uuid AND $2 = md5('admin')::uuid THEN RETURN true; END IF;
  IF $1 = md5('org')::uuid AND $2 = md5('user')::uuid THEN RETURN false; END IF;
  RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
END;
$$;

\ir ../migrations/20261123080000_mercadolibre_sale_accounting_review.sql

INSERT INTO public.sales_orders VALUES
  (md5('sale')::uuid, md5('org')::uuid, md5('warehouse')::uuid, 'MERCADO_LIBRE',
   'USD', 90071992547409.91, 'authorized'),
  (md5('other-sale')::uuid, md5('other-org')::uuid, md5('warehouse')::uuid,
   'MERCADO_LIBRE', 'ARS', 10, 'authorized');
INSERT INTO public.credit_notes VALUES
  (md5('note')::uuid, md5('org')::uuid, md5('sale')::uuid, 'MERCADO_LIBRE',
   'USD', 20.00, 'CONFIRMED', 'authorized'),
  (md5('other-note')::uuid, md5('other-org')::uuid, md5('sale')::uuid, 'MERCADO_LIBRE',
   'USD', 99, 'CONFIRMED', 'authorized');
INSERT INTO public.mercadolibre_payments VALUES
  (md5('payment')::uuid, md5('org')::uuid, md5('sale')::uuid, 'USD', 80.00, 'RECORDED'),
  (md5('other-payment')::uuid, md5('other-org')::uuid, md5('sale')::uuid, 'USD', 99, 'RECORDED');

DO $$
DECLARE v_result jsonb; v_failed boolean := false;
BEGIN
  IF has_function_privilege('authenticated',
    'public.get_meli_sale_accounting_review(uuid,uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.get_meli_sale_accounting_review(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Permisos de revisión incorrectos';
  END IF;
  v_result := public.get_meli_sale_accounting_review(
    md5('org')::uuid, md5('admin')::uuid, md5('sale')::uuid);
  IF v_result->>'amount' <> '90071992547409.91'
    OR jsonb_array_length(v_result->'notes') <> 1
    OR jsonb_array_length(v_result->'payments') <> 1
    OR v_result->'payments'->0->>'amount' <> '80.00'
    OR v_result->'notes'->0->>'amount' <> '20.00' THEN
    RAISE EXCEPTION 'Resultado de revisión incorrecto: %', v_result;
  END IF;
  BEGIN
    PERFORM public.get_meli_sale_accounting_review(
      md5('org')::uuid, md5('user')::uuid, md5('sale')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Lectura permitida sin depósito'; END IF;
  INSERT INTO public.warehouse_user_assignments VALUES
    (md5('org')::uuid, md5('user')::uuid, md5('warehouse')::uuid);
  PERFORM public.get_meli_sale_accounting_review(
    md5('org')::uuid, md5('user')::uuid, md5('sale')::uuid);
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_sale_accounting_review(
      md5('other-org')::uuid, md5('admin')::uuid, md5('other-sale')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Lectura permitida en otra organización'; END IF;
END;
$$;

DO $$
DECLARE v_failed boolean; v_result jsonb;
BEGIN
  INSERT INTO public.credit_notes
    SELECT md5('limit-note-' || i)::uuid, md5('org')::uuid, md5('sale')::uuid,
      'MERCADO_LIBRE', 'USD', 1, 'CONFIRMED', 'authorized'
    FROM generate_series(1, 199) AS i;
  v_result := public.get_meli_sale_accounting_review(
    md5('org')::uuid, md5('admin')::uuid, md5('sale')::uuid);
  IF jsonb_array_length(v_result->'notes') <> 200 THEN
    RAISE EXCEPTION 'No se devolvieron las 200 notas permitidas';
  END IF;
  INSERT INTO public.credit_notes VALUES
    (md5('limit-note-200')::uuid, md5('org')::uuid, md5('sale')::uuid,
      'MERCADO_LIBRE', 'USD', 1, 'CONFIRMED', 'authorized');
  v_failed := false;
  BEGIN
    v_result := public.get_meli_sale_accounting_review(
      md5('org')::uuid, md5('admin')::uuid, md5('sale')::uuid);
    IF jsonb_array_length(v_result->'payments') <> 200 THEN
      RAISE EXCEPTION 'No se devolvieron los 200 cobros permitidos';
    END IF;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%excede el límite%' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'No se aplicó el límite de notas'; END IF;
  DELETE FROM public.credit_notes WHERE id IN
    (SELECT md5('limit-note-' || i)::uuid FROM generate_series(1, 200) AS i);

  INSERT INTO public.mercadolibre_payments
    SELECT md5('limit-payment-' || i)::uuid, md5('org')::uuid,
      md5('sale')::uuid, 'USD', 1, 'RECORDED'
    FROM generate_series(1, 199) AS i;
  PERFORM public.get_meli_sale_accounting_review(
    md5('org')::uuid, md5('admin')::uuid, md5('sale')::uuid);
  INSERT INTO public.mercadolibre_payments VALUES
    (md5('limit-payment-200')::uuid, md5('org')::uuid, md5('sale')::uuid,
      'USD', 1, 'RECORDED');
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_sale_accounting_review(
      md5('org')::uuid, md5('admin')::uuid, md5('sale')::uuid);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%excede el límite%' THEN RAISE; END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'No se aplicó el límite de cobros'; END IF;
END;
$$;
