-- Preserve the installed currency/advance logic of the three legacy dashboard
-- RPCs, while giving every sales_orders source an explicit wholesale scope.
-- The source patterns are the verified definitions from 20260922120000.
-- Fail atomically if an environment has a different implementation to review.
BEGIN;
DO $$
DECLARE v_signature text; v_function regprocedure; v_definition text; v_rewritten text;
  v_expected integer; v_sources integer; v_froms integer; v_joins integer;
  v_guard text := E'BEGIN\n  IF NOT (coalesce(auth.role(), '''') = ''service_role''\n    OR public.user_has_org_permission(p_org_id, ''organization.admin'')\n    OR public.user_has_org_permission(p_org_id, ''dashboard.read'')) THEN\n    RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''Sin permiso para consultar Torre de Control'';\n  END IF;';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_control_tower_kpis(uuid,date,date,uuid,uuid)',
    'public.get_financial_balance(uuid,date,date,uuid,uuid)',
    'public.get_top_performers(uuid,date,date)'
  ] LOOP
    v_function := pg_catalog.to_regprocedure(v_signature);
    IF v_function IS NULL THEN RAISE EXCEPTION 'Falta la RPC esperada: %', v_signature; END IF;
    v_definition := pg_catalog.pg_get_functiondef(v_function);
    v_expected := CASE WHEN v_signature LIKE '%control_tower%' THEN 3 ELSE 2 END;
    SELECT count(*) INTO v_sources FROM pg_catalog.regexp_matches(v_definition,
      E'\\m(?:FROM|JOIN)\\s+(?:public\\.)?sales_orders\\M', 'gi');
    SELECT count(*) INTO v_froms FROM pg_catalog.regexp_matches(v_definition,
      E'\\mFROM\\s+(?:public\\.)?sales_orders\\s+WHERE\\M', 'gi');
    SELECT count(*) INTO v_joins FROM pg_catalog.regexp_matches(v_definition,
      E'\\mJOIN\\s+(?:public\\.)?sales_orders\\s+so\\s+ON\\M', 'gi');
    IF v_sources <> v_expected OR v_sources <> v_froms + v_joins
      OR pg_catalog.strpos(v_definition, 'sales_channel') > 0 THEN
      RAISE EXCEPTION 'Revisar definición instalada de % antes de modificar su alcance por canal', v_signature;
    END IF;
    v_rewritten := pg_catalog.regexp_replace(v_definition,
      E'\\mFROM\\s+(?:public\\.)?sales_orders\\M',
      'FROM (SELECT * FROM public.sales_orders WHERE sales_channel = ''WHOLESALE'') AS sales_orders', 'gi');
    v_rewritten := pg_catalog.regexp_replace(v_rewritten,
      E'\\mJOIN\\s+(?:public\\.)?sales_orders\\s+so\\s+ON\\M',
      'JOIN (SELECT * FROM public.sales_orders WHERE sales_channel = ''WHOLESALE'') so ON', 'gi');
    v_rewritten := pg_catalog.regexp_replace(v_rewritten, E'\\mBEGIN\\M', v_guard, 'i');
    EXECUTE v_rewritten;
    EXECUTE 'ALTER FUNCTION ' || v_signature || ' SET search_path = public, pg_temp';
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_signature || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_signature || ' TO authenticated, service_role';
  END LOOP;
END;
$$;
COMMIT;
