-- Migración 1: create price_levels + repoint FKs from margin lists
-- Parte del rediseño listas-precio-comisiones v2 (ver /listas-y-comisiones.md)

-- 1. Nueva tabla price_levels (tiers de margen)
CREATE TABLE IF NOT EXISTS price_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  margin numeric(5,2) NOT NULL DEFAULT 0,
  extra_commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_levels_org ON price_levels(organization_id);
CREATE INDEX IF NOT EXISTS idx_price_levels_org_active
  ON price_levels(organization_id, is_active);

-- 2. Copiar las listas con is_target_margin = true a price_levels
--    Reutilizamos el MISMO id para que el re-apuntado de FKs sea trivial:
--    price_level_id = sales_price_list_id (mismo valor).
--    margin = value (el margen ya vive en value para listas target-margin).
INSERT INTO price_levels (
  id, organization_id, name, margin, extra_commission_rate, is_active, valid_from,
  created_at, updated_at
)
SELECT
  id,
  organization_id,
  name,
  value,
  COALESCE(extra_commission_rate, 0),
  COALESCE(is_active, true),
  valid_from,
  COALESCE(created_at, now()),
  COALESCE(updated_at, now())
FROM sales_price_lists
WHERE is_target_margin = true
ON CONFLICT (id) DO NOTHING;

-- 3. Agregar price_level_id a las tablas que hoy apuntan a una lista de venta
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS price_level_id uuid REFERENCES price_levels(id) ON DELETE SET NULL;

ALTER TABLE customer_supplier_assignments
  ADD COLUMN IF NOT EXISTS price_level_id uuid REFERENCES price_levels(id) ON DELETE SET NULL;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS price_level_id uuid REFERENCES price_levels(id) ON DELETE SET NULL;

-- Snapshot del margen aplicado en la venta (para comisiones y auditoría).
-- Se backfillea a NULL (histórico) y se completa en ventas nuevas.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS margin numeric(5,2);

-- 4. Re-apuntar clientes que tenían asignada una lista tipo margen
UPDATE customers
SET price_level_id = sales_price_list_id
WHERE sales_price_list_id IS NOT NULL
  AND sales_price_list_id IN (SELECT id FROM sales_price_lists WHERE is_target_margin = true);

-- 5. Re-apuntar asignaciones por proveedor que usaban una lista tipo margen
UPDATE customer_supplier_assignments
SET price_level_id = sales_price_list_id
WHERE sales_price_list_id IS NOT NULL
  AND sales_price_list_id IN (SELECT id FROM sales_price_lists WHERE is_target_margin = true);

-- 6. Re-apuntar ventas históricas que usaron una lista tipo margen
UPDATE sales_orders
SET price_level_id = sales_price_list_id
WHERE sales_price_list_id IS NOT NULL
  AND sales_price_list_id IN (SELECT id FROM sales_price_lists WHERE is_target_margin = true);