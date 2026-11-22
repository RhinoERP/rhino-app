-- Run in an empty disposable database with psql. Fixtures do not use production data.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.organizations(id uuid PRIMARY KEY, is_active boolean, pos_enabled boolean);
CREATE TABLE public.roles(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, description text);
CREATE TABLE public.role_permissions(role_id uuid, permission_id uuid);
CREATE TABLE public.organization_members(organization_id uuid, user_id uuid, role_id uuid, is_active boolean, is_owner boolean);
CREATE TABLE public.organization_settings(organization_id uuid, settings jsonb);
CREATE TABLE public.warehouse_user_assignments(organization_id uuid, user_id uuid, warehouse_id uuid);
CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, organization_id uuid, sales_channel text);
CREATE TABLE public.mercadolibre_payments(
  id uuid PRIMARY KEY, organization_id uuid, sales_order_id uuid, warehouse_id uuid,
  amount numeric, currency text, payment_date date, status text
);
CREATE FUNCTION public.assert_meli_payment_access(p_org_id uuid, p_actor_id uuid, p_write boolean)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_owner boolean;
BEGIN
  SELECT m.is_owner INTO v_owner FROM public.organization_members m
  WHERE m.organization_id = p_org_id AND m.user_id = p_actor_id AND m.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sin acceso'; END IF;
  RETURN v_owner;
END;
$$;
\ir ../migrations/20261121190000_mercadolibre_accounting_breakdown_drafts.sql

SELECT set_config('request.jwt.claim.role', 'service_role', false);
INSERT INTO public.organizations VALUES
  (md5('org')::uuid, true, true),
  (md5('other-org')::uuid, true, true);
INSERT INTO auth.users VALUES (md5('owner')::uuid), (md5('user')::uuid);
INSERT INTO public.roles VALUES (md5('role')::uuid, md5('org')::uuid);
INSERT INTO public.organization_members VALUES
  (md5('org')::uuid, md5('owner')::uuid, null, true, true),
  (md5('other-org')::uuid, md5('owner')::uuid, null, true, true),
  (md5('org')::uuid, md5('user')::uuid, md5('role')::uuid, true, false);
INSERT INTO public.role_permissions SELECT md5('role')::uuid, id FROM public.permissions
  WHERE key = 'mercadolibre.accounting.manage';
INSERT INTO public.organization_settings VALUES
  (md5('org')::uuid, '{"accounting_integration_enabled":true,"mercadolibre_accounting_enabled":true}'),
  (md5('other-org')::uuid, '{"accounting_integration_enabled":true,"mercadolibre_accounting_enabled":true}');
INSERT INTO public.sales_orders VALUES (md5('sale')::uuid, md5('org')::uuid, 'MERCADO_LIBRE');
INSERT INTO public.mercadolibre_payments VALUES
  (md5('payment')::uuid, md5('org')::uuid, md5('sale')::uuid, md5('warehouse')::uuid, 100, 'ARS', '2026-11-21', 'RECORDED');
INSERT INTO public.warehouse_user_assignments VALUES (md5('org')::uuid, md5('user')::uuid, md5('warehouse')::uuid);

DO $$
DECLARE v_first uuid; v_second uuid; v_replay record; v_failed boolean;
  v_breakdown jsonb := '{"net":"80","discount":"5","commission":"10","shipping":"5"}';
BEGIN
  IF has_table_privilege('service_role', 'public.mercadolibre_accounting_breakdown_drafts', 'INSERT')
    OR has_function_privilege('authenticated', 'public.save_meli_accounting_breakdown_draft(uuid,uuid,uuid,uuid,integer,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Los borradores no deben admitir escritura directa o RPC autenticada';
  END IF;
  SELECT draft_id INTO v_first FROM public.save_meli_accounting_breakdown_draft(
    md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('key1')::uuid, 0, v_breakdown, 'liquidación');
  SELECT * INTO v_replay FROM public.save_meli_accounting_breakdown_draft(
    md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('key1')::uuid, 0, v_breakdown, 'liquidación');
  IF v_replay.draft_id <> v_first OR NOT v_replay.idempotent OR v_replay.version <> 1 THEN
    RAISE EXCEPTION 'Reintento no idempotente';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('key1')::uuid, 0, v_breakdown, 'distinta');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Clave reutilizada con otra evidencia'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('bad')::uuid, 1,
      '{"net":"81","discount":"5","commission":"10","shipping":"5"}', '');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un desglose descuadrado'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('invalid')::uuid, 1,
      '{"net":"80.001","discount":"5","commission":"10","shipping":"5"}', '');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó precisión monetaria inválida'; END IF;
  SELECT draft_id INTO v_second FROM public.save_meli_accounting_breakdown_draft(
    md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('key2')::uuid, 1,
    '{"net":"78","discount":"5","commission":"10","shipping":"5","manualConcepts":[{"description":"Otro","accountId":"00000000-0000-4000-8000-000000000001","amount":"2","direction":"ADD"}]}', '');
  IF v_first = v_second OR
    (SELECT count(*) FROM public.mercadolibre_accounting_breakdown_drafts WHERE active) <> 1 OR
    (SELECT version FROM public.mercadolibre_accounting_breakdown_drafts WHERE id = v_second) <> 2 OR
    (SELECT active FROM public.mercadolibre_accounting_breakdown_drafts WHERE id = v_first) THEN
    RAISE EXCEPTION 'Versionado incorrecto';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid,
      md5('stale')::uuid, 1, v_breakdown, '');
  EXCEPTION WHEN serialization_failure THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un desglose basado en una versión desactualizada'; END IF;
  IF (SELECT count(*) FROM public.mercadolibre_accounting_breakdown_drafts) <> 2
    OR NOT (SELECT active FROM public.mercadolibre_accounting_breakdown_drafts WHERE id = v_second) THEN
    RAISE EXCEPTION 'Un conflicto de versión modificó el historial';
  END IF;
  SELECT * INTO v_replay FROM public.save_meli_accounting_breakdown_draft(
    md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('key1')::uuid, 0, v_breakdown, 'liquidación');
  IF v_replay.draft_id <> v_first OR NOT v_replay.idempotent THEN
    RAISE EXCEPTION 'No se pudo recuperar el resultado de una versión anterior';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid,
      md5('key1')::uuid, 1, v_breakdown, 'liquidación');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una clave con otra versión esperada'; END IF;
  IF (SELECT count(*) FROM public.list_meli_accounting_breakdown_drafts(
    md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid)) <> 2 THEN
    RAISE EXCEPTION 'No se recuperó la historia completa del desglose';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.list_meli_accounting_breakdown_drafts(
      md5('other-org')::uuid, md5('owner')::uuid, md5('payment')::uuid);
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se permitió leer un cobro de otra organización'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('other-org')::uuid, md5('owner')::uuid, md5('payment')::uuid,
      md5('cross-org')::uuid, 0, v_breakdown, '');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se permitió desglosar un cobro de otra organización'; END IF;
  DELETE FROM public.role_permissions;
  v_failed := false;
  BEGIN
    PERFORM public.list_meli_accounting_breakdown_drafts(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se permitió leer sin permiso contable'; END IF;
  INSERT INTO public.role_permissions SELECT md5('role')::uuid, id FROM public.permissions
    WHERE key = 'mercadolibre.accounting.manage';
  DELETE FROM public.warehouse_user_assignments;
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid, md5('key3')::uuid, 2, v_breakdown, '');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un usuario sin depósito'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.list_meli_accounting_breakdown_drafts(
      md5('org')::uuid, md5('user')::uuid, md5('payment')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se permitió leer sin depósito'; END IF;
  UPDATE public.mercadolibre_payments SET status = 'VOIDED';
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, md5('key4')::uuid, 2, v_breakdown, '');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un cobro anulado'; END IF;
  UPDATE public.organization_settings SET settings = '{"accounting_integration_enabled":true}';
  v_failed := false;
  BEGIN
    PERFORM public.save_meli_accounting_breakdown_draft(
      md5('org')::uuid, md5('owner')::uuid, md5('payment')::uuid, md5('key5')::uuid, 2, v_breakdown, '');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó integración deshabilitada'; END IF;
END;
$$;
