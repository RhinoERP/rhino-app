SET request.jwt.claim.role='service_role';
CREATE SEQUENCE test_cai_issuer START 10000000;

-- Builds ordinary source orders and the same documentary payload as the app.
-- Numbering, source checks and idempotency execute the production function.
CREATE FUNCTION test_persistence_case(
  p_fiscal boolean, p_automatic boolean, p_legacy_auto boolean DEFAULT true,
  p_legacy_counter bigint DEFAULT 100, p_mode text DEFAULT 'self_printed',
  p_existing jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid := coalesce((p_existing->>'org')::uuid,gen_random_uuid());
  v_actor uuid := coalesce((p_existing->>'actor')::uuid,gen_random_uuid());
  v_quote uuid := gen_random_uuid(); v_order uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid(); v_item uuid; v_auth uuid := gen_random_uuid();
  v_cuit text := '30' || nextval('test_cai_issuer')::text || '0';
  v_docs jsonb := '[]'; v_lines jsonb := '[]'; v_i integer;
BEGIN
  IF p_existing IS NULL THEN
    INSERT INTO organizations(id,cuit,remittance_auto_enabled,remittance_last_number)
      VALUES(v_org,v_cuit,p_legacy_auto,p_legacy_counter);
    INSERT INTO auth.users VALUES(v_actor);
    INSERT INTO organization_members(organization_id,user_id,is_active,is_owner) VALUES(v_org,v_actor,true,true);
    IF p_fiscal THEN
      PERFORM save_remittance_fiscal_settings(v_org,jsonb_build_object(
        'enabled',true,'mode',p_mode,'loginCuit','20111111112','pointOfSale',9,
        'businessName','Fixture fiscal','address','Calle 123','vatCondition','IVA RESPONSABLE INSCRITO',
        'grossIncome','123','activityStart','2020-01-01'));
      INSERT INTO remittance_cai_authorizations(id,organization_id,cuit,point_of_sale,mode,cai,expires_at)
        VALUES(v_auth,v_org,v_cuit,9,p_mode,'12345678901234',current_date+20);
      PERFORM activate_remittance_cai(v_org,jsonb_build_object(
        'authorizationId',v_auth,'firstNumber',1,'lastNumber',100,'lastUsedNumber',0,
        'printerName','Imprenta','printerCuit','20111111112','printerRegistration','123',
        'printedAt',current_date::text,'evidence','Constancia fixture verificada','confirmed',true));
    END IF;
  END IF;
  INSERT INTO quotes(id,organization_id) VALUES(v_quote,v_org);
  INSERT INTO orders(id,organization_id,quote_id,created_by) VALUES(v_order,v_org,v_quote,v_actor);
  INSERT INTO products(id,organization_id) VALUES(v_product,v_org);
  FOR v_i IN 1..27 LOOP
    v_item := gen_random_uuid();
    INSERT INTO quote_items(id,quote_id,product_id,quantity) VALUES(v_item,v_quote,v_product,1);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',v_product,'product_variant_id',NULL,'sku','FIXTURE','product_name','Producto fixture',
      'brand',NULL,'variant_name',NULL,'unit_of_measure','UN','quantity',1,'weight_quantity',NULL,
      'unit_price',10,'subtotal',10,'discount_percentage',0,'extras_snapshot','[]'::jsonb,
      'sources',jsonb_build_array(jsonb_build_object('order_id',v_order,'quote_item_id',v_item,'quantity',1))));
    IF v_i=26 OR v_i=27 THEN
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_number',CASE WHEN p_automatic THEN NULL ELSE 'MAN-'||(jsonb_array_length(v_docs)+1)::text END,
        'package_count',NULL,'declared_value',NULL,'currency','ARS',
        'header_snapshot',jsonb_build_object('remittance',jsonb_build_object(
          'customer',jsonb_build_object('businessName','Cliente fixture','cuit','20111111112','address','Calle 456'))),
        'lines',v_lines));
      v_lines := '[]';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('org',v_org,'actor',v_actor,'parent',v_order,'key',gen_random_uuid(),
    'source',order_remittance_source_fingerprint(v_org,ARRAY[v_order]),'automatic',p_automatic,'documents',v_docs);
END;
$$;

CREATE FUNCTION test_persist(p_case jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.document_position)
  FROM public.persist_order_remittance_documents_internal(
    (p_case->>'org')::uuid,(p_case->>'actor')::uuid,(p_case->>'parent')::uuid,
    ARRAY[(p_case->>'parent')::uuid],(p_case->>'key')::uuid,p_case->>'source',
    (p_case->>'automatic')::boolean,p_case->'documents') r
$$;

DO $$
DECLARE c jsonb; result jsonb; retry jsonb;
BEGIN
  c := test_persistence_case(true,true,false);
  result := test_persist(c);
  IF result->0->>'document_number'<>'00009-00000001' OR result->1->>'document_number'<>'00009-00000002'
    OR (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>100
    OR (SELECT next_number FROM remittance_cai_authorizations WHERE organization_id=(c->>'org')::uuid)<>3
    OR (SELECT count(*) FROM order_remittance_line_sources WHERE organization_id=(c->>'org')::uuid)<>27 THEN
    RAISE EXCEPTION 'Fiscal persistence changed the legacy sequence or lost documentary sources';
  END IF;
  retry := test_persist(c);
  IF retry<>result OR (SELECT count(*) FROM order_remittances WHERE organization_id=(c->>'org')::uuid)<>2
    OR (SELECT issued_count FROM remittance_cai_authorizations WHERE organization_id=(c->>'org')::uuid)<>2 THEN
    RAISE EXCEPTION 'Idempotent fiscal retry consumed additional numbers';
  END IF;
  BEGIN
    PERFORM test_persist(jsonb_set(c,'{key}',to_jsonb(gen_random_uuid())));
    RAISE EXCEPTION 'TEST: duplicate documentation accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;

  -- Fiscal allocation must not even evaluate the overflowing legacy allocator.
  c := test_persistence_case(true,true,false,9223372036854775807);
  PERFORM test_persist(c);
  IF (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>9223372036854775807 THEN
    RAISE EXCEPTION 'Fiscal allocation touched the legacy counter';
  END IF;

  c := test_persistence_case(false,true);
  result := test_persist(c);
  IF result->0->>'document_number'<>'REM-00101' OR result->1->>'document_number'<>'REM-00102'
    OR (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>102 THEN
    RAISE EXCEPTION 'Legacy automatic numbering changed';
  END IF;
  c := test_persistence_case(false,true);
  INSERT INTO sales_orders(id,organization_id,remittance_number) VALUES(gen_random_uuid(),(c->>'org')::uuid,'REM-00101');
  -- The sales context changed; prepare the ordinary source fingerprint again.
  c := jsonb_set(c,'{source}',to_jsonb(order_remittance_source_fingerprint((c->>'org')::uuid,ARRAY[(c->>'parent')::uuid])));
  result := test_persist(c);
  IF result->0->>'document_number'<>'REM-00102' OR result->1->>'document_number'<>'REM-00103'
    OR (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>103 THEN
    RAISE EXCEPTION 'Legacy numbering did not skip an occupied number';
  END IF;
  c := test_persistence_case(false,false);
  result := test_persist(c);
  IF result->0->>'document_number'<>'MAN-1' OR result->1->>'document_number'<>'MAN-2'
    OR (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>100 THEN
    RAISE EXCEPTION 'Legacy manual numbering changed';
  END IF;

  c := test_persistence_case(true,true);
  PERFORM test_persist(c);
  UPDATE remittance_fiscal_settings SET enabled=false WHERE organization_id=(c->>'org')::uuid;
  UPDATE organization_settings SET settings=settings||'{"remittance_fiscal_enabled":false}'::jsonb WHERE organization_id=(c->>'org')::uuid;
  c := test_persistence_case(false,true,true,100,'self_printed',c);
  result := test_persist(c);
  IF result->0->>'document_number'<>'REM-00101'
    OR (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>102
    OR (SELECT next_number FROM remittance_cai_authorizations WHERE organization_id=(c->>'org')::uuid)<>3 THEN
    RAISE EXCEPTION 'Returning to legacy numbering did not preserve independent sequences';
  END IF;

  c := test_persistence_case(true,true,false,100,'preprinted');
  PERFORM test_persist(c);
  IF (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>100 THEN
    RAISE EXCEPTION 'Preprinted CAI consumed the legacy counter';
  END IF;

  c := test_persistence_case(true,true,false);
  c := jsonb_set(c,'{documents,1,lines,0,quantity}','-1');
  BEGIN
    PERFORM test_persist(c);
    RAISE EXCEPTION 'TEST: invalid second document accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM order_remittances WHERE organization_id=(c->>'org')::uuid)<>0
    OR (SELECT next_number FROM remittance_cai_authorizations WHERE organization_id=(c->>'org')::uuid)<>1
    OR (SELECT remittance_last_number FROM organizations WHERE id=(c->>'org')::uuid)<>100 THEN
    RAISE EXCEPTION 'A failed batch consumed numbering';
  END IF;

  c := test_persistence_case(true,true,false);
  UPDATE remittance_cai_authorizations SET last_number=1 WHERE organization_id=(c->>'org')::uuid;
  BEGIN
    PERFORM test_persist(c);
    RAISE EXCEPTION 'TEST: exhausted fiscal range accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  IF (SELECT next_number FROM remittance_cai_authorizations WHERE organization_id=(c->>'org')::uuid)<>1
    OR (SELECT count(*) FROM order_remittances WHERE organization_id=(c->>'org')::uuid)<>0 THEN
    RAISE EXCEPTION 'Exhaustion did not roll back the complete batch';
  END IF;

  c := test_persistence_case(false,true,false);
  BEGIN
    PERFORM test_persist(c);
    RAISE EXCEPTION 'TEST: disabled legacy automatic numbering accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  c := test_persistence_case(true,false);
  BEGIN
    PERFORM test_persist(c);
    RAISE EXCEPTION 'TEST: manual numbering accepted for CAI';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  BEGIN
    PERFORM test_persist(c);
    RAISE EXCEPTION 'TEST: unauthorized persistence accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

SET request.jwt.claim.role='service_role';
CREATE TABLE test_persistence_concurrency(id integer PRIMARY KEY,args jsonb NOT NULL);
INSERT INTO test_persistence_concurrency VALUES(1,test_persistence_case(true,true,false));
INSERT INTO test_persistence_concurrency SELECT 2,test_persistence_case(true,true,false,100,'self_printed',args)
  FROM test_persistence_concurrency WHERE id=1;
SELECT 'Production persistence: CAI/legacy/manual, retry, rollback, exhaustion and access checks passed';
