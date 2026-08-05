ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS target_margin_list_id UUID REFERENCES sales_price_lists(id);
