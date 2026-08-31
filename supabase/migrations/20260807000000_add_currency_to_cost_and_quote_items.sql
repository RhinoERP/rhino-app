-- Agrega columna currency a price_list_items para soportar costos en USD
ALTER TABLE price_list_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE price_list_items
  DROP CONSTRAINT IF EXISTS price_list_items_currency_check;

ALTER TABLE price_list_items
  ADD CONSTRAINT price_list_items_currency_check
    CHECK (currency IN ('ARS', 'USD'));

-- Agrega columna currency a quote_items para soportar items de presupuesto en USD
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE quote_items
  DROP CONSTRAINT IF EXISTS quote_items_currency_check;

ALTER TABLE quote_items
  ADD CONSTRAINT quote_items_currency_check
    CHECK (currency IN ('ARS', 'USD'));
