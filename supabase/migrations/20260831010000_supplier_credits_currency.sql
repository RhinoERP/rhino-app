-- Multimoneda: los saldos a favor de proveedores heredan la moneda de la deuda
-- que los originó (accounts_payable.currency), al igual que customer_credits.
-- Los créditos existentes sin un vínculo determinístico quedan en ARS.

ALTER TABLE public.supplier_credits
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

-- Backfill determinístico: créditos cuyo pago de origen se puede resolver
-- heredan la moneda de la cuenta por pagar; el resto queda ARS.
UPDATE public.supplier_credits AS credit
SET currency = COALESCE(payable_account.currency, 'ARS')
FROM public.payable_payments AS payment
JOIN public.accounts_payable AS payable_account
  ON payable_account.id = payment.account_payable_id
WHERE credit.source_payment_id = payment.id
  AND credit.currency IS DISTINCT FROM COALESCE(payable_account.currency, 'ARS');

DO $$
DECLARE
  inherited_count integer;
BEGIN
  SELECT count(*)
  INTO inherited_count
  FROM public.supplier_credits
  WHERE currency = 'USD';

  RAISE NOTICE
    'Supplier credits backfilled to USD: % (rest remain ARS)',
    inherited_count;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'supplier_credits_currency_check'
      AND conrelid = 'public.supplier_credits'::regclass
  ) THEN
    ALTER TABLE public.supplier_credits
      ADD CONSTRAINT supplier_credits_currency_check
      CHECK (currency IN ('ARS', 'USD'));
  END IF;
END;
$$;