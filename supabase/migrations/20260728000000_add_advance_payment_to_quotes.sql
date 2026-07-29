-- Add advance_payment and advance_payment_percentage columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS advance_payment boolean DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS advance_payment_percentage integer;

