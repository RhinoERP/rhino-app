-- Add the fiscal/discount breakdown returned by CHESS and target metadata for
-- reference-only links to related vouchers outside the imported date window.
ALTER TABLE public.historical_sales_documents
  ADD COLUMN IF NOT EXISTS gross_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS net_taxable_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS net_other_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS non_taxable_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS exempt_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS vat_1_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS vat_1_fiscal_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS vat_2_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS perception_212_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS perception_3337_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS perception_iibb_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS internal_tax_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS detraccion_amount numeric(18, 6);

ALTER TABLE public.historical_sales_document_items
  ADD COLUMN IF NOT EXISTS gross_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS final_price numeric(18, 6),
  ADD COLUMN IF NOT EXISTS freight_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS non_taxable_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS exempt_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS perception_212_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS perception_3337_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS perception_iibb_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS internal_tax_amount numeric(18, 6),
  ADD COLUMN IF NOT EXISTS detraccion_amount numeric(18, 6);

ALTER TABLE public.historical_sales_document_links
  ADD COLUMN IF NOT EXISTS target_document_name text,
  ADD COLUMN IF NOT EXISTS target_document_date date,
  ADD COLUMN IF NOT EXISTS target_printed_number text,
  ADD COLUMN IF NOT EXISTS target_relation_type text;

CREATE INDEX IF NOT EXISTS historical_sales_documents_org_page_idx
  ON public.historical_sales_documents
  (organization_id, document_date DESC, document_number DESC);
CREATE INDEX IF NOT EXISTS historical_sales_documents_org_number_idx
  ON public.historical_sales_documents
  (organization_id, document_series, document_number);

COMMENT ON COLUMN public.historical_sales_documents.gross_amount IS
  'bruto de CHESS antes de bonificaciones.';
COMMENT ON COLUMN public.historical_sales_documents.discount_amount IS
  'bonif de cabecera de CHESS.';
COMMENT ON COLUMN public.historical_sales_document_items.gross_amount IS
  'bruto de línea de CHESS antes de bonificaciones.';
COMMENT ON COLUMN public.historical_sales_document_items.final_price IS
  'preciofinal de CHESS, preservado sin reinterpretar.';
COMMENT ON COLUMN public.historical_sales_document_items.freight_amount IS
  'flete de línea de CHESS.';
COMMENT ON COLUMN public.historical_sales_document_links.target_relation_type IS
  'tiporela de CHESS, por ejemplo PEDIDO o CABECERA.';
