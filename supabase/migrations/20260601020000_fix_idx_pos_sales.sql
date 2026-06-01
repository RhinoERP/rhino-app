-- Fix: índice que existe en prod pero falta en dev
-- Aplicar en develop para mantener sincronía

CREATE INDEX IF NOT EXISTS idx_pos_sales_org_date
  ON pos_sales(organization_id, sale_date DESC);
