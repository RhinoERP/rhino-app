-- Reconciles deployments where Supabase Dev already has part of the
-- multimoneda schema. Every structural operation is idempotent so this can be
-- applied both to Dev and to an environment that only has the migration files.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric,
  ADD COLUMN IF NOT EXISTS amount_ars numeric;

ALTER TABLE public.payable_payments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric,
  ADD COLUMN IF NOT EXISTS amount_ars numeric;

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.debit_notes
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE public.customer_credits
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

-- Historical rows predate multimoneda and are necessarily ARS.
UPDATE public.sales_orders SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.sales_order_items SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.accounts_receivable SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.accounts_payable SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.receivable_payments SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.payable_payments SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.credit_notes SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.debit_notes SET currency = 'ARS' WHERE currency IS NULL;
UPDATE public.customer_credits SET currency = 'ARS' WHERE currency IS NULL;

ALTER TABLE public.sales_orders ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.sales_order_items ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.accounts_receivable ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.accounts_payable ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.receivable_payments ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.payable_payments ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.credit_notes ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.debit_notes ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.customer_credits ALTER COLUMN currency SET DEFAULT 'ARS', ALTER COLUMN currency SET NOT NULL;

DO $$
DECLARE
  relation_name text;
  constraint_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'sales_orders', 'sales_order_items', 'accounts_receivable',
    'accounts_payable', 'receivable_payments', 'payable_payments',
    'credit_notes', 'debit_notes', 'customer_credits'
  ] LOOP
    constraint_name := relation_name || '_currency_check';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name AND conrelid = ('public.' || relation_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (currency IN (''ARS'', ''USD'')) NOT VALID',
        relation_name,
        constraint_name
      );
    END IF;
  END LOOP;
END $$;

-- Notes always inherit the currency of their source invoice. This also keeps
-- drafts consistent before their ARCA request is built.
CREATE OR REPLACE FUNCTION public.inherit_sales_document_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sales_order_id IS NOT NULL THEN
    SELECT currency INTO NEW.currency
    FROM public.sales_orders
    WHERE id = NEW.sales_order_id AND organization_id = NEW.organization_id;
  END IF;
  NEW.currency := COALESCE(NEW.currency, 'ARS');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_credit_note_currency ON public.credit_notes;
CREATE TRIGGER inherit_credit_note_currency
  BEFORE INSERT OR UPDATE OF sales_order_id ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.inherit_sales_document_currency();

DROP TRIGGER IF EXISTS inherit_debit_note_currency ON public.debit_notes;
CREATE TRIGGER inherit_debit_note_currency
  BEFORE INSERT OR UPDATE OF sales_order_id ON public.debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.inherit_sales_document_currency();

-- Receivables created by debit-note/legacy RPCs must not fall back to ARS.
CREATE OR REPLACE FUNCTION public.inherit_receivable_currency_from_sale()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sales_order_id IS NOT NULL THEN
    SELECT currency INTO NEW.currency FROM public.sales_orders WHERE id = NEW.sales_order_id;
  END IF;
  NEW.currency := COALESCE(NEW.currency, 'ARS');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_receivable_currency_from_sale ON public.accounts_receivable;
CREATE TRIGGER inherit_receivable_currency_from_sale
  BEFORE INSERT ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.inherit_receivable_currency_from_sale();

CREATE OR REPLACE FUNCTION public.inherit_customer_credit_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.credit_note_id IS NOT NULL THEN
    SELECT currency INTO NEW.currency FROM public.credit_notes WHERE id = NEW.credit_note_id;
  END IF;
  NEW.currency := COALESCE(NEW.currency, 'ARS');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_customer_credit_currency ON public.customer_credits;
CREATE TRIGGER inherit_customer_credit_currency
  BEFORE INSERT OR UPDATE OF credit_note_id ON public.customer_credits
  FOR EACH ROW EXECUTE FUNCTION public.inherit_customer_credit_currency();

-- A credit balance may only cancel receivables in its own currency.
CREATE OR REPLACE FUNCTION public.reject_cross_currency_credit_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  credit_currency text;
  receivable_currency text;
BEGIN
  IF NEW.customer_credit_id IS NULL OR NEW.account_receivable_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT currency INTO credit_currency FROM public.customer_credits WHERE id = NEW.customer_credit_id;
  SELECT currency INTO receivable_currency FROM public.accounts_receivable WHERE id = NEW.account_receivable_id;

  IF COALESCE(credit_currency, 'ARS') <> COALESCE(receivable_currency, 'ARS') THEN
    RAISE EXCEPTION 'No se puede aplicar un saldo a favor % contra una deuda %',
      COALESCE(credit_currency, 'ARS'), COALESCE(receivable_currency, 'ARS');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_cross_currency_credit_application ON public.customer_credit_applications;
CREATE TRIGGER reject_cross_currency_credit_application
  BEFORE INSERT OR UPDATE OF customer_credit_id, account_receivable_id
  ON public.customer_credit_applications
  FOR EACH ROW EXECUTE FUNCTION public.reject_cross_currency_credit_application();

CREATE INDEX IF NOT EXISTS customer_credits_org_customer_currency_idx
  ON public.customer_credits(organization_id, customer_id, currency)
  WHERE remaining_amount > 0;
