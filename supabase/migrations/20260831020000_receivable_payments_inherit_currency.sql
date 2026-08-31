-- Multimoneda: los pagos siempre heredan la moneda de la cuenta que descuentan.
-- Cierra el bache de anticipos y de cualquier path (legacy o RPC) que cree un
-- pago sin especificar moneda: la deuda manda sobre el default de la columna.

CREATE OR REPLACE FUNCTION public.inherit_payment_currency_from_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_currency text;
BEGIN
  IF NEW.account_receivable_id IS NOT NULL THEN
    SELECT currency INTO account_currency
    FROM public.accounts_receivable
    WHERE id = NEW.account_receivable_id;
    IF account_currency IS NOT NULL THEN
      NEW.currency := account_currency;
    END IF;
  END IF;
  NEW.currency := COALESCE(NEW.currency, 'ARS');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_payment_currency_from_account ON public.receivable_payments;
CREATE TRIGGER inherit_payment_currency_from_account
  BEFORE INSERT OR UPDATE OF account_receivable_id ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.inherit_payment_currency_from_account();

CREATE OR REPLACE FUNCTION public.inherit_payable_payment_currency_from_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_currency text;
BEGIN
  IF NEW.account_payable_id IS NOT NULL THEN
    SELECT currency INTO account_currency
    FROM public.accounts_payable
    WHERE id = NEW.account_payable_id;
    IF account_currency IS NOT NULL THEN
      NEW.currency := account_currency;
    END IF;
  END IF;
  NEW.currency := COALESCE(NEW.currency, 'ARS');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_payable_payment_currency_from_account ON public.payable_payments;
CREATE TRIGGER inherit_payable_payment_currency_from_account
  BEFORE INSERT OR UPDATE OF account_payable_id ON public.payable_payments
  FOR EACH ROW EXECUTE FUNCTION public.inherit_payable_payment_currency_from_account();