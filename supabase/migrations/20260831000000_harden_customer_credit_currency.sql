-- Ensure every customer credit keeps the currency of its fiscal/commercial source.
-- Only rows with a deterministic relation are backfilled; unrelated historical
-- credits remain ARS and are reported for manual review.

UPDATE public.customer_credits AS credit
SET currency = note.currency
FROM public.credit_notes AS note
WHERE credit.credit_note_id = note.id
  AND credit.currency IS DISTINCT FROM note.currency;

UPDATE public.customer_credits AS credit
SET currency = sale.currency
FROM public.sales_returns AS sales_return
JOIN public.sales_orders AS sale ON sale.id = sales_return.sales_order_id
WHERE credit.credit_note_id IS NULL
  AND credit.sales_return_id = sales_return.id
  AND credit.currency IS DISTINCT FROM sale.currency;

DO $$
DECLARE
  ambiguous_count integer;
BEGIN
  SELECT count(*)
  INTO ambiguous_count
  FROM public.customer_credits
  WHERE credit_note_id IS NULL
    AND sales_return_id IS NULL;

  RAISE NOTICE
    'Customer credits without a deterministic currency source retained as stored: %',
    ambiguous_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.inherit_customer_credit_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.credit_note_id IS NOT NULL THEN
    SELECT currency INTO NEW.currency
    FROM public.credit_notes
    WHERE id = NEW.credit_note_id;
  ELSIF NEW.sales_return_id IS NOT NULL THEN
    SELECT sale.currency INTO NEW.currency
    FROM public.sales_returns AS sales_return
    JOIN public.sales_orders AS sale ON sale.id = sales_return.sales_order_id
    WHERE sales_return.id = NEW.sales_return_id;
  END IF;

  NEW.currency := COALESCE(NEW.currency, 'ARS');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_customer_credit_currency ON public.customer_credits;
CREATE TRIGGER inherit_customer_credit_currency
  BEFORE INSERT OR UPDATE OF credit_note_id, sales_return_id ON public.customer_credits
  FOR EACH ROW EXECUTE FUNCTION public.inherit_customer_credit_currency();
