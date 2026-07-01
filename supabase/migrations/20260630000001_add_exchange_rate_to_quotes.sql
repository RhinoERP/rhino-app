-- Add exchange_rate column to quotes table for USD conversion tracking
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,2);
