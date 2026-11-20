-- Run after both CHESS history migrations in an isolated test database.
BEGIN;
INSERT INTO public.organizations(id) VALUES
  ('00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000202');
INSERT INTO public.products(id,organization_id,name) VALUES
  ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000201','Artículo de prueba'),
  ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000201','Presentación desconocida');
INSERT INTO public.historical_sales_documents
  (id,organization_id,source_key,company_code,document_code,document_number,
   document_class,revenue_sign,is_fiscal,document_date,cancelled,is_reference_only)
VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','sale','1','FCVTA',1,'SALE',1,true,'2026-10-01',false,false),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000201','credit','1','DVVTA',2,'CREDIT_NOTE',-1,true,'2026-10-02',false,false),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000201','reference','1','FCVTA',3,'SALE',1,true,'2026-10-01',false,true),
  ('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000201','cancelled','1','FCVTA',4,'SALE',1,true,'2026-10-01',true,false),
  ('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000202','other-org','1','FCVTA',5,'SALE',1,true,'2026-10-01',false,false);

INSERT INTO public.historical_sales_document_items
  (id,organization_id,historical_document_id,line_number,product_id,product_chess_code,
   description,quantity,remainder_quantity,units_per_box,base_unit_quantity,total_amount,cancelled,generic_merchandise)
VALUES
  ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',1,'00000000-0000-0000-0000-000000000401','SKU1','Descripción antigua',1,2,6,8,100,false,false),
  ('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',2,'00000000-0000-0000-0000-000000000401','SKU1','Descripción nueva',0,1,6,1,10,false,false),
  ('00000000-0000-0000-0000-000000000503','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000102',1,'00000000-0000-0000-0000-000000000401','SKU1','Crédito',0,2,6,2,20,false,false),
  ('00000000-0000-0000-0000-000000000504','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000103',1,'00000000-0000-0000-0000-000000000401','SKU1','Referencia',1000,0,6,6000,10000,false,false),
  ('00000000-0000-0000-0000-000000000505','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000104',1,'00000000-0000-0000-0000-000000000401','SKU1','Anulado',1000,0,6,6000,10000,false,false),
  ('00000000-0000-0000-0000-000000000506','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',3,'00000000-0000-0000-0000-000000000401','SKU1','Línea anulada',1000,0,6,6000,10000,true,false),
  ('00000000-0000-0000-0000-000000000507','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',4,NULL,'0','MERCADERIA',0,0,NULL,NULL,10000,false,true),
  ('00000000-0000-0000-0000-000000000508','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101',5,'00000000-0000-0000-0000-000000000402','SKU2','Sin presentación',1,0,NULL,NULL,10,false,false);

DO $$
DECLARE metric record;
BEGIN
  SELECT * INTO STRICT metric FROM public.get_historical_sales_product_metrics(
    '00000000-0000-0000-0000-000000000201','2026-10-01','2026-10-31',20)
  WHERE product_chess_code='SKU1';
  IF metric.signed_quantity <> 7 OR metric.signed_amount <> 90 OR metric.document_count <> 2 THEN
    RAISE EXCEPTION 'Incorrect totals after boxes + loose units - credit note: %', row_to_json(metric);
  END IF;
  SELECT * INTO STRICT metric FROM public.get_historical_sales_product_metrics(
    '00000000-0000-0000-0000-000000000201','2026-10-01','2026-10-31',20)
  WHERE product_chess_code='SKU2';
  IF metric.signed_quantity IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown presentations must not become zero or raw box counts';
  END IF;
  IF EXISTS (SELECT 1 FROM public.historical_sales_product_report WHERE product_chess_code='0') THEN
    RAISE EXCEPTION 'Generic merchandise must not enter SKU analytics';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_historical_sales_product_metrics(
    '00000000-0000-0000-0000-000000000201','2026-11-01','2026-11-30',20)) THEN
    RAISE EXCEPTION 'Date filter ignored';
  END IF;
END $$;

INSERT INTO public.organization_members(organization_id,user_id)
VALUES ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000301');
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000301',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.historical_sales_documents
    WHERE organization_id='00000000-0000-0000-0000-000000000202') THEN
    RAISE EXCEPTION 'RLS leaked another organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_historical_sales_product_metrics(
    '00000000-0000-0000-0000-000000000201','2026-10-01','2026-10-31',20)) THEN
    RAISE EXCEPTION 'Authorized member cannot read metrics';
  END IF;
END $$;
ROLLBACK;
