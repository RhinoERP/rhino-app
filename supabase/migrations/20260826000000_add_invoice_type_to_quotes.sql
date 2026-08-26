-- Add invoice_type column to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice_type text DEFAULT 'NOTA_DE_VENTA';
