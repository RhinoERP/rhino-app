-- Products Extras: columnas de clasificación y contabilidad

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS can_sell BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS can_buy BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS can_produce BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS accounting_account_code TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS accounting_account_name TEXT;
