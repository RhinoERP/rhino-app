-- Agrega columna is_target_margin a sales_price_lists
-- true = value representa el margen directo sobre el costo; false = multiplicativo
ALTER TABLE sales_price_lists
  ADD COLUMN IF NOT EXISTS is_target_margin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sales_price_lists.is_target_margin IS
  'Cuando es true, value representa el margen directo sobre el costo. False = comportamiento multiplicativo actual.';