ALTER TYPE quote_status ADD VALUE 'CANCELLED';

ALTER TABLE quotes
  ADD COLUMN parent_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

CREATE INDEX idx_quotes_parent_quote_id ON quotes(parent_quote_id);
