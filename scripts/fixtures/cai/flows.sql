SET request.jwt.claim.role='service_role';
INSERT INTO organizations VALUES('10000000-0000-4000-8000-000000000001','30710158230',false),('10000000-0000-4000-8000-000000000002','20111111112',false);
INSERT INTO auth.users VALUES('20000000-0000-4000-8000-000000000001');
INSERT INTO order_remittance_batches VALUES('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
INSERT INTO orders VALUES('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
SELECT save_remittance_fiscal_settings('10000000-0000-4000-8000-000000000001','{"enabled":true,"mode":"self_printed","loginCuit":"20111111112","pointOfSale":9,"businessName":"Safe","address":"Calle 123","vatCondition":"IVA RESPONSABLE INSCRITO","grossIncome":"123","activityStart":"2020-01-01"}');
INSERT INTO remittance_cai_authorizations(id,organization_id,cuit,point_of_sale,mode,cai,expires_at)
VALUES('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30710158230',9,'self_printed','12345678901234',current_date+10);
SELECT activate_remittance_cai('10000000-0000-4000-8000-000000000001','{"authorizationId":"60000000-0000-4000-8000-000000000001","firstNumber":1,"lastNumber":2,"lastUsedNumber":0,"printerName":"","printerCuit":"","printerRegistration":"","printedAt":"","evidence":"Constancia de ARCA 123","confirmed":true}');
CREATE FUNCTION test_issue_cai() RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE result uuid; BEGIN
 INSERT INTO order_remittances(organization_id,batch_id,document_number,header_snapshot)
 VALUES('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',gen_random_uuid()::text,'{"remittance":{"customer":{"businessName":"Cliente","cuit":"20111111112","address":"Calle 456"}}}') RETURNING id INTO result;
 RETURN result;
END; $$;
SELECT test_issue_cai();
SELECT test_issue_cai();
DO $$ BEGIN
 IF (SELECT next_number FROM remittance_cai_authorizations WHERE id='60000000-0000-4000-8000-000000000001')<>3 THEN RAISE EXCEPTION 'Counter did not advance'; END IF;
 IF (SELECT count(*) FROM order_remittances WHERE document_number IN ('00009-00000001','00009-00000002') AND header_snapshot->'remittance'->'fiscal'->>'businessName'='Safe')<>2 THEN RAISE EXCEPTION 'Fiscal snapshot missing'; END IF;
 BEGIN PERFORM test_issue_cai(); RAISE EXCEPTION 'TEST: exhausted range accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
 BEGIN UPDATE order_remittances SET document_number='edited' WHERE document_number='00009-00000001'; RAISE EXCEPTION 'TEST: mutable number'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
 BEGIN DELETE FROM order_remittances WHERE document_number='00009-00000001'; RAISE EXCEPTION 'TEST: deleted fiscal document'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
 BEGIN INSERT INTO order_dispatch_events(order_id) VALUES('50000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'TEST: legacy dispatch bypass'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
END; $$;
-- Real dispatch events for the documented group are still accepted.
INSERT INTO order_dispatch_events(order_id,dispatch_group_id) VALUES('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
-- Renewal must not rewind the fiscal sequence.
INSERT INTO remittance_cai_authorizations(id,organization_id,cuit,point_of_sale,mode,cai,expires_at)
VALUES('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30710158230',9,'self_printed','22345678901234',current_date+20);
DO $$ BEGIN
 BEGIN PERFORM activate_remittance_cai('10000000-0000-4000-8000-000000000001','{"authorizationId":"60000000-0000-4000-8000-000000000002","firstNumber":1,"lastNumber":null,"lastUsedNumber":0,"printerName":"","printerCuit":"","printerRegistration":"","printedAt":"","evidence":"Nueva constancia","confirmed":true}'); RAISE EXCEPTION 'TEST: rewind accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
END; $$;
SELECT activate_remittance_cai('10000000-0000-4000-8000-000000000001','{"authorizationId":"60000000-0000-4000-8000-000000000002","firstNumber":1,"lastNumber":null,"lastUsedNumber":2,"printerName":"","printerCuit":"","printerRegistration":"","printedAt":"","evidence":"Nueva constancia","confirmed":true}');
DO $$ BEGIN
 IF (SELECT state FROM remittance_cai_authorizations WHERE id='60000000-0000-4000-8000-000000000001')<>'replaced' THEN RAISE EXCEPTION 'Renewal did not replace old CAI'; END IF;
 BEGIN
  PERFORM test_issue_cai();
  RAISE EXCEPTION 'forced rollback';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 IF (SELECT next_number FROM remittance_cai_authorizations WHERE id='60000000-0000-4000-8000-000000000002')<>3 THEN RAISE EXCEPTION 'Rollback consumed number'; END IF;
END; $$;
-- An expired authorization blocks emission without consuming a number.
UPDATE remittance_cai_authorizations SET expires_at=current_date-1 WHERE state='active';
DO $$ BEGIN
 BEGIN PERFORM test_issue_cai(); RAISE EXCEPTION 'TEST: expired accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
END; $$;
UPDATE remittance_cai_authorizations SET expires_at=current_date+20 WHERE state='active';
-- Requests require a matching validation and use durable per-tenant idempotency.
SELECT begin_remittance_cai_operation('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','validate','{"cuit":"30710158230","username":"20111111112","validateOnly":true,"comprobantes":[{"puntoVenta":9,"tipoComprobante":91,"cantidad":50}],"resguardo":false}');
DO $$ BEGIN
 BEGIN PERFORM begin_remittance_cai_operation('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','validate','{"cuit":"30710158230","username":"20111111112"}'); RAISE EXCEPTION 'TEST: concurrent request allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
END; $$;
SELECT complete_remittance_cai_operation(organization_id,id,'{"status":"validated"}') FROM remittance_cai_operations;
SELECT begin_remittance_cai_operation('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','request','{"cuit":"30710158230","username":"20111111112","validateOnly":false,"comprobantes":[{"puntoVenta":9,"tipoComprobante":91,"cantidad":50}],"resguardo":false}');
SELECT begin_remittance_cai_operation('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','request','{"cuit":"30710158230","username":"20111111112","validateOnly":false,"comprobantes":[{"puntoVenta":9,"tipoComprobante":91,"cantidad":50}],"resguardo":false}');
SELECT complete_remittance_cai_operation(organization_id,id,jsonb_build_object('status','requested','cai','32345678901234','expiresAt',(current_date+20)::text)) FROM remittance_cai_operations WHERE kind='request';
SELECT complete_remittance_cai_operation(organization_id,id,jsonb_build_object('status','requested','cai','32345678901234','expiresAt',(current_date+20)::text)) FROM remittance_cai_operations WHERE kind='request';
DO $$ BEGIN
 IF (SELECT count(*) FROM remittance_cai_operations)<>2 OR (SELECT count(*) FROM remittance_cai_authorizations WHERE cai='32345678901234')<>1 THEN RAISE EXCEPTION 'Duplicate operation/authorization'; END IF;
END; $$;
SELECT begin_remittance_cai_operation('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004','check_cancel','{"cuit":"30710158230","username":"20111111112","cai":"32345678901234","validateOnly":true}');
SELECT complete_remittance_cai_operation(organization_id,id,'{"status":"cancellable"}') FROM remittance_cai_operations WHERE kind='check_cancel';
SELECT begin_remittance_cai_operation('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000005','cancel','{"cuit":"30710158230","username":"20111111112","cai":"32345678901234","validateOnly":false}');
DO $$ BEGIN
 BEGIN PERFORM test_issue_cai(); RAISE EXCEPTION 'TEST: issued while cancellation pending'; EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'TEST:%' THEN RAISE; END IF; END;
END; $$;
SELECT complete_remittance_cai_operation(organization_id,id,'{"status":"cancelled"}') FROM remittance_cai_operations WHERE kind='cancel';
DO $$ BEGIN
 IF (SELECT state FROM remittance_cai_authorizations WHERE cai='32345678901234')<>'cancelled' THEN RAISE EXCEPTION 'Cancellation not persisted'; END IF;
END; $$;
-- Receiver confirmation is scoped to one live document and is idempotent.
INSERT INTO remittance_receipts(remittance_id,organization_id,token_hash)
SELECT id,organization_id,repeat('a',64) FROM order_remittances WHERE document_number='00009-00000001';
SELECT confirm_remittance_receipt(repeat('a',64),'María Gómez');
SELECT confirm_remittance_receipt(repeat('a',64),'Other Person');
DO $$ BEGIN IF (SELECT receiver_name FROM remittance_receipts)<>'María Gómez' THEN RAISE EXCEPTION 'Duplicate receipt changed signer'; END IF; END; $$;
SET request.jwt.claim.role='authenticated';
DO $$ BEGIN
 BEGIN PERFORM activate_remittance_cai('10000000-0000-4000-8000-000000000002','{}'); RAISE EXCEPTION 'TEST: unauthorized RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SELECT 'CAI lifecycle, numbering, rollback, isolation and receipt checks passed';
