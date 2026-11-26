-- Empty disposable database only. Simplified fixture; no accounting service.
\set ON_ERROR_STOP on
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY, organization_id uuid, sales_channel text, currency text, total_amount numeric
);
CREATE TABLE public.mercadolibre_payments (
  id uuid PRIMARY KEY, organization_id uuid, sales_order_id uuid, amount numeric,
  currency text, status text
);
CREATE TABLE public.mercadolibre_fiscal_accounting_preparations (
  id uuid PRIMARY KEY, organization_id uuid, sale_id uuid, origin_type text, origin_id uuid,
  source_snapshot jsonb
);
CREATE TABLE public.mercadolibre_fiscal_accounting_dispatches (
  preparation_id uuid PRIMARY KEY, status text
);
CREATE TABLE public.mercadolibre_accounting_payment_preparations (
  id uuid PRIMARY KEY, organization_id uuid, payment_id uuid
);
CREATE TABLE public.mercadolibre_accounting_payment_dispatches (
  preparation_id uuid, component_key text, status text, PRIMARY KEY (preparation_id, component_key)
);
CREATE TABLE public.mercadolibre_payment_reversal_reservations (
  organization_id uuid, payment_id uuid, status text
);
\ir ../migrations/20261123070000_mercadolibre_sale_accounting_reservations.sql

BEGIN;
INSERT INTO public.sales_orders VALUES
  (md5('sale')::uuid, md5('org')::uuid, 'MERCADO_LIBRE', 'USD', 100),
  (md5('other-sale')::uuid, md5('other-org')::uuid, 'MERCADO_LIBRE', 'ARS', 50);
INSERT INTO public.mercadolibre_fiscal_accounting_preparations VALUES
  (md5('invoice')::uuid, md5('org')::uuid, md5('sale')::uuid, 'invoice', md5('sale')::uuid,
    '{"amount":"100.00","currency":"USD"}'),
  (md5('note')::uuid, md5('org')::uuid, md5('sale')::uuid, 'creditNote', md5('note')::uuid,
    '{"amount":"40.00","currency":"USD"}'),
  (md5('note2')::uuid, md5('org')::uuid, md5('sale')::uuid, 'creditNote', md5('note2')::uuid,
    '{"amount":"1.00","currency":"USD"}'),
  (md5('wrong-note')::uuid, md5('org')::uuid, md5('sale')::uuid, 'creditNote', md5('wrong-note')::uuid,
    '{"amount":"1.00","currency":"ARS"}');
INSERT INTO public.mercadolibre_payments VALUES
  (md5('payment')::uuid, md5('org')::uuid, md5('sale')::uuid, 60, 'USD', 'RECORDED'),
  (md5('payment2')::uuid, md5('org')::uuid, md5('sale')::uuid, 1, 'USD', 'RECORDED');
INSERT INTO public.mercadolibre_accounting_payment_preparations VALUES
  (md5('payment-prep')::uuid, md5('org')::uuid, md5('payment')::uuid),
  (md5('payment2-prep')::uuid, md5('org')::uuid, md5('payment2')::uuid);
COMMIT;

BEGIN;
DO $$
DECLARE v_failed boolean;
BEGIN
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_accounting_payment_dispatches
      VALUES (md5('payment-prep')::uuid, 'net', 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un cobro sin factura publicada'; END IF;
  INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
    VALUES (md5('invoice')::uuid, 'UNCERTAIN');
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
      VALUES (md5('note')::uuid, 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una nota con factura incierta'; END IF;
  UPDATE public.mercadolibre_fiscal_accounting_dispatches SET status = 'PUBLISHED'
    WHERE preparation_id = md5('invoice')::uuid;
  UPDATE public.sales_orders SET total_amount = 101 WHERE id = md5('sale')::uuid;
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
      VALUES (md5('note')::uuid, 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una factura modificada'; END IF;
  UPDATE public.sales_orders SET total_amount = 100 WHERE id = md5('sale')::uuid;
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
      VALUES (md5('wrong-note')::uuid, 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una nota en otra moneda'; END IF;
  INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
    VALUES (md5('note')::uuid, 'UNCERTAIN');
  INSERT INTO public.mercadolibre_accounting_payment_dispatches
    VALUES (md5('payment-prep')::uuid, 'net', 'UNCERTAIN');
  INSERT INTO public.mercadolibre_accounting_payment_dispatches
    VALUES (md5('payment-prep')::uuid, 'commission', 'UNCERTAIN');
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_accounting_payment_dispatches
      VALUES (md5('payment2-prep')::uuid, 'net', 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un cobro excedido'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
      VALUES (md5('note2')::uuid, 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó una nota excedida'; END IF;
  INSERT INTO public.mercadolibre_payment_reversal_reservations
    VALUES (md5('org')::uuid, md5('payment')::uuid, 'RESERVED');
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_accounting_payment_dispatches
      VALUES (md5('payment2-prep')::uuid, 'net', 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se liberó saldo con reversión pendiente'; END IF;
  UPDATE public.mercadolibre_payments SET status = 'VOIDED' WHERE id = md5('payment')::uuid;
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_accounting_payment_dispatches
      VALUES (md5('payment2-prep')::uuid, 'net', 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se liberó saldo sin reversión finalizada'; END IF;
  UPDATE public.mercadolibre_payment_reversal_reservations SET status = 'VOIDED'
    WHERE payment_id = md5('payment')::uuid;
  INSERT INTO public.mercadolibre_accounting_payment_dispatches
    VALUES (md5('payment2-prep')::uuid, 'net', 'UNCERTAIN');
  INSERT INTO public.mercadolibre_fiscal_accounting_preparations VALUES
    (md5('other-invoice')::uuid, md5('other-org')::uuid, md5('other-sale')::uuid,
      'invoice', md5('other-sale')::uuid, '{"amount":"50","currency":"ARS"}'),
    (md5('other-note')::uuid, md5('other-org')::uuid, md5('other-sale')::uuid,
      'creditNote', md5('other-note')::uuid, '{"amount":"49.99","currency":"ARS"}');
  INSERT INTO public.mercadolibre_fiscal_accounting_dispatches
    VALUES (md5('other-invoice')::uuid, 'PUBLISHED'),
      (md5('other-note')::uuid, 'PUBLISHED');
  INSERT INTO public.mercadolibre_payments VALUES
    (md5('other-payment')::uuid, md5('other-org')::uuid, md5('other-sale')::uuid,
      0.01, 'ARS', 'RECORDED');
  INSERT INTO public.mercadolibre_accounting_payment_preparations VALUES
    (md5('other-payment-prep')::uuid, md5('other-org')::uuid, md5('other-payment')::uuid);
  INSERT INTO public.mercadolibre_accounting_payment_dispatches
    VALUES (md5('other-payment-prep')::uuid, 'net', 'UNCERTAIN');
  INSERT INTO public.mercadolibre_payments VALUES
    (md5('other-over')::uuid, md5('other-org')::uuid, md5('other-sale')::uuid,
      0.01, 'ARS', 'RECORDED');
  INSERT INTO public.mercadolibre_accounting_payment_preparations VALUES
    (md5('other-over-prep')::uuid, md5('other-org')::uuid, md5('other-over')::uuid);
  v_failed := false;
  BEGIN
    INSERT INTO public.mercadolibre_accounting_payment_dispatches
      VALUES (md5('other-over-prep')::uuid, 'net', 'UNCERTAIN');
  EXCEPTION WHEN raise_exception THEN v_failed := true; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Se aceptó un exceso de un centavo en ARS'; END IF;
  IF has_function_privilege('service_role',
    'public.assert_meli_sale_dispatch_capacity(uuid,uuid,text,uuid,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Control interno expuesto';
  END IF;
END;
$$;
ROLLBACK;
