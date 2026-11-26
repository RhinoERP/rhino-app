-- Run only against an empty disposable PostgreSQL instance; creates roles and fixtures.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.warehouse_user_assignments (organization_id uuid, user_id uuid, warehouse_id uuid);
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY, organization_id uuid, warehouse_id uuid, sales_channel text,
  currency text, total_amount numeric, arca_status text, arca_cae text,
  arca_request_json jsonb, arca_point_of_sale integer, arca_voucher_type_code integer,
  arca_voucher_number integer
);
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY, organization_id uuid, sales_order_id uuid, sales_channel text,
  currency text, amount numeric, status text, arca_status text, arca_cae text,
  arca_request_json jsonb, arca_point_of_sale integer, arca_voucher_type_code integer,
  arca_voucher_number integer, arca_associated_point_of_sale integer,
  arca_associated_voucher_type_code integer, arca_associated_voucher_number integer
);
CREATE FUNCTION public.assert_meli_accounting_access(p_org_id uuid, p_actor_id uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF p_org_id = md5('org')::uuid AND p_actor_id = md5('owner')::uuid THEN RETURN true; END IF;
  IF p_org_id = md5('org')::uuid AND p_actor_id = md5('user')::uuid THEN RETURN false; END IF;
  RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
END;
$$;
CREATE FUNCTION public.assert_meli_accounting_preparation_cleanup_access(p_org_id uuid, p_actor_id uuid)
RETURNS boolean LANGUAGE sql AS $$
  SELECT public.assert_meli_accounting_access(p_org_id, p_actor_id)
$$;
\ir ../migrations/20261123040000_mercadolibre_fiscal_accounting_preparations.sql

INSERT INTO public.organizations VALUES (md5('org')::uuid);
INSERT INTO auth.users VALUES (md5('owner')::uuid), (md5('user')::uuid);
INSERT INTO public.sales_orders VALUES
  (md5('sale')::uuid, md5('org')::uuid, md5('warehouse')::uuid, 'MERCADO_LIBRE',
   'ARS', 100, 'authorized', '123', '{"wsfeRequest":{"ImpTotal":100}}', 1, 1, 42);
INSERT INTO public.credit_notes VALUES
  (md5('note')::uuid, md5('org')::uuid, md5('sale')::uuid, 'MERCADO_LIBRE',
   'ARS', 20, 'CONFIRMED', 'authorized', '456', '{"wsfeRequest":{"ImpTotal":20}}',
   1, 3, 43, 1, 1, 42);

DO $$
DECLARE v_result record; v_id uuid; v_failed boolean;
BEGIN
  IF has_table_privilege('service_role', 'public.mercadolibre_fiscal_accounting_preparations', 'INSERT')
    OR has_function_privilege('authenticated',
      'public.prepare_meli_fiscal_accounting(uuid,uuid,uuid,text,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.get_meli_fiscal_accounting_preparation(uuid,uuid,uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.get_meli_fiscal_accounting_preparation(uuid,uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Preparación fiscal expuesta a clientes o escritura directa';
  END IF;
  SELECT * INTO v_result FROM public.prepare_meli_fiscal_accounting(
    md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
    'invoice', md5('sale')::uuid, md5('key')::uuid);
  v_id := v_result.preparation_id;
  IF v_result.idempotent OR NOT EXISTS (
    SELECT 1 FROM public.mercadolibre_fiscal_accounting_preparations
      WHERE id = v_id AND source_snapshot->>'amount' = '100'
        AND source_snapshot->'request'->'wsfeRequest'->>'ImpTotal' = '100'
  ) THEN RAISE EXCEPTION 'Snapshot fiscal incorrecto'; END IF;
  SELECT * INTO v_result FROM public.prepare_meli_fiscal_accounting(
    md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
    'invoice', md5('sale')::uuid, md5('key')::uuid);
  IF NOT v_result.idempotent OR v_result.preparation_id <> v_id THEN
    RAISE EXCEPTION 'Reintento no idempotente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_meli_fiscal_accounting_preparation(
      md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
      'invoice', md5('sale')::uuid)
    WHERE preparation_id = v_id AND request_key = md5('key')::uuid
      AND source_snapshot->>'cae' = '123'
  ) THEN RAISE EXCEPTION 'No se recuperó la fuente fiscal'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_fiscal_accounting(
      md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
      'creditNote', md5('note')::uuid, md5('key')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Clave reutilizada para otro comprobante'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_fiscal_accounting(
      md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
      'invoice', md5('sale')::uuid, md5('new-key')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se admitió otra preparación del comprobante'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_fiscal_accounting_preparation(
      md5('other-org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
      'invoice', md5('sale')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se permitió lectura en otra organización'; END IF;
  SELECT * INTO v_result FROM public.prepare_meli_fiscal_accounting(
    md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
    'creditNote', md5('note')::uuid, md5('note-key')::uuid);
  IF v_result.idempotent OR NOT EXISTS (
    SELECT 1 FROM public.mercadolibre_fiscal_accounting_preparations
    WHERE id = v_result.preparation_id AND source_snapshot->>'associatedVoucherNumber' = '42'
      AND source_snapshot->>'invoiceCae' = '123'
  ) THEN RAISE EXCEPTION 'Fuente de nota incorrecta'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_fiscal_accounting(
      md5('org')::uuid, md5('user')::uuid, md5('sale')::uuid,
      'invoice', md5('sale')::uuid, md5('other-key')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se omitió acceso al depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_meli_fiscal_accounting_preparation(
      md5('org')::uuid, md5('user')::uuid, md5('sale')::uuid,
      'invoice', md5('sale')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se leyó sin acceso al depósito'; END IF;
  UPDATE public.credit_notes SET arca_associated_voucher_number = 99
    WHERE id = md5('note')::uuid;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_fiscal_accounting(
      md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
      'creditNote', md5('note')::uuid, md5('note-key')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó asociación fiscal alterada'; END IF;
  UPDATE public.sales_orders SET arca_request_json = '{"changed":true}'
    WHERE id = md5('sale')::uuid;
  v_failed := false;
  BEGIN
    PERFORM public.prepare_meli_fiscal_accounting(
      md5('org')::uuid, md5('owner')::uuid, md5('sale')::uuid,
      'invoice', md5('sale')::uuid, md5('key')::uuid);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó snapshot fiscal alterado'; END IF;
END;
$$;
