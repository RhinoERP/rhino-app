-- Commercial USD quote is independent from the fiscal rate authorized by ARCA.
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS commercial_exchange_rate numeric(18,6);

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_commercial_exchange_rate_positive
  CHECK (commercial_exchange_rate IS NULL OR commercial_exchange_rate > 0);

-- Only the immutable quote snapshot is evidence of a historical commercial rate.
-- sales_orders.exchange_rate may contain the fiscal ARCA rate, so never copy it.
UPDATE public.sales_orders
SET commercial_exchange_rate = CASE
  WHEN commercial_snapshot ->> 'exchangeRate' ~ '^[0-9]{1,12}([.][0-9]{1,6})?$'
    THEN NULLIF((commercial_snapshot ->> 'exchangeRate')::numeric, 0)
  ELSE NULL
END
WHERE currency = 'USD'
  AND arca_status <> 'pending'
  AND commercial_exchange_rate IS NULL
  AND commercial_snapshot ->> 'exchangeRate' IS NOT NULL;
