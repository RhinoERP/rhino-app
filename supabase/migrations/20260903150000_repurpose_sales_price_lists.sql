-- Migración 2: repurpose sales_price_lists a "ajustes" + quotes a price_levels
-- Parte del rediseño listas-precio-comisiones v2 (ver /listas-y-comisiones.md)
--
-- ADITIVA + DROP DE COLUMNAS:
-- - sales_price_lists pierde is_target_margin y extra_commission_rate (el
--   margen y la comisión viven ahora en price_levels, migrados en la migración 1).
-- - quotes: target_margin_list_id se reemplaza por price_level_id + sales_price_list_id.
-- - NO se borran filas de sales_price_lists: las filas migradas quedan huérfanas
--   pero inofensivas, y los FK de commissions/pos_terminals/whatsapp_integrations
--   que apuntaban a esas listas siguen siendo válidos.

-- 1. quotes: nueva columna price_level_id (FK a price_levels)
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS price_level_id uuid REFERENCES price_levels(id) ON DELETE SET NULL;

-- 2. quotes: nueva columna sales_price_list_id (ajuste usado, FK a sales_price_lists)
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sales_price_list_id uuid REFERENCES sales_price_lists(id) ON DELETE SET NULL;

-- 3. Re-apuntar: target_margin_list_id apuntaba a una lista con is_target_margin=true,
--    que en la migración 1 pasó a price_levels con el MISMO id.
UPDATE quotes
SET price_level_id = target_margin_list_id
WHERE target_margin_list_id IS NOT NULL;

-- 4. Dropear la columna legacy target_margin_list_id y su FK
ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_target_margin_list_id_fkey;

ALTER TABLE quotes
  DROP COLUMN IF EXISTS target_margin_list_id;

-- 5. sales_price_lists: dropear columnas migradas a price_levels
ALTER TABLE sales_price_lists
  DROP COLUMN IF EXISTS is_target_margin;

ALTER TABLE sales_price_lists
  DROP COLUMN IF EXISTS extra_commission_rate;