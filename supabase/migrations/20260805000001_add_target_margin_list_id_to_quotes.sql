ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS target_margin_list_id UUID
    REFERENCES sales_price_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_target_margin_list
  ON quotes(target_margin_list_id);
