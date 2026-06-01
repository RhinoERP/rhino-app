-- Product Variants Module
-- Tabla de variantes (talle + color) para productos

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  talle TEXT NOT NULL,
  color TEXT NOT NULL,
  lot_id UUID NOT NULL REFERENCES product_lots(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, talle, color)
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_product_variants_lot_id
  ON product_variants(lot_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_is_active
  ON product_variants(product_id, is_active);

-- 3. FK en sales_order_items
ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_order_items_variant_id
  ON sales_order_items(product_variant_id);

-- 4. FK en pos_sale_items
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_variant_id
  ON pos_sale_items(product_variant_id);

-- 5. Función updated_at (compartida con otros módulos)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. Trigger updated_at
DO $$ BEGIN
  CREATE TRIGGER product_variants_set_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Columna has_variants en products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false;

-- 8. Permitir NULL en expiration_date (variantes no tienen vencimiento)
ALTER TABLE product_lots
  ALTER COLUMN expiration_date DROP NOT NULL;

-- 9. RLS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY product_variants_select ON product_variants
    FOR SELECT
    USING (
      organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY product_variants_insert ON product_variants
    FOR INSERT
    WITH CHECK (
      organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY product_variants_update ON product_variants
    FOR UPDATE
    USING (
      organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY product_variants_delete ON product_variants
    FOR DELETE
    USING (
      organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
