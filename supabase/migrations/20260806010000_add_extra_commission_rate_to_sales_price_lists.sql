-- Agrega columna extra_commission_rate a sales_price_lists
-- Tasa de comisión extra específica de la lista de precios de venta
ALTER TABLE sales_price_lists
  ADD COLUMN IF NOT EXISTS extra_commission_rate numeric(5,2);

-- Tasa de comisión base del miembro de la organización
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS base_commission_rate numeric(5,2);

-- Id de listas de precio
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS sales_price_list_id uuid REFERENCES sales_price_lists(id);