ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID
  REFERENCES product_variants(id) ON DELETE SET NULL;
