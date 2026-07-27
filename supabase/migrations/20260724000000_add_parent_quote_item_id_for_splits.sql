-- Add parent_quote_item_id to support partial item splits
-- When a quote_item is split, the new row references the original via this column
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS parent_quote_item_id UUID REFERENCES quote_items(id);

CREATE INDEX IF NOT EXISTS idx_quote_items_parent_quote_item_id
  ON quote_items(parent_quote_item_id)
  WHERE parent_quote_item_id IS NOT NULL;
