-- Read-only CHESS sales history. These rows are for consultation and analytics;
-- they must never create stock, ARCA, accounting, or operational receivables.
CREATE TABLE IF NOT EXISTS public.historical_sales_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  company_code text NOT NULL,
  document_code text NOT NULL,
  document_name text NOT NULL DEFAULT '',
  document_letter text NOT NULL DEFAULT '',
  document_series integer NOT NULL DEFAULT 0,
  document_number integer NOT NULL,
  branch_code text,
  printed_number text,
  document_class text NOT NULL CHECK (document_class IN ('SALE', 'CREDIT_NOTE', 'DEBIT_NOTE')),
  revenue_sign smallint NOT NULL CHECK (revenue_sign IN (-1, 1)),
  is_fiscal boolean NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_chess_code text,
  seller_chess_code text,
  document_date date NOT NULL,
  due_date date,
  cancelled boolean NOT NULL DEFAULT false,
  settlement_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (settlement_status IN ('UNVERIFIED', 'PAID', 'OPEN', 'PARTIAL', 'NOT_APPLICABLE')),
  net_amount numeric(18, 4),
  tax_amount numeric(18, 4),
  total_amount numeric(18, 4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ARS',
  source_snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_sales_documents_id_org_unique
    UNIQUE (id, organization_id),
  CONSTRAINT historical_sales_documents_source_key_unique
    UNIQUE (organization_id, source_key)
);

CREATE INDEX IF NOT EXISTS historical_sales_documents_org_date_idx
  ON public.historical_sales_documents (organization_id, document_date DESC);
CREATE INDEX IF NOT EXISTS historical_sales_documents_org_customer_date_idx
  ON public.historical_sales_documents (organization_id, customer_id, document_date DESC);
CREATE INDEX IF NOT EXISTS historical_sales_documents_org_type_date_idx
  ON public.historical_sales_documents (organization_id, document_code, document_date DESC);

CREATE TABLE IF NOT EXISTS public.historical_sales_document_items (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  historical_document_id uuid NOT NULL,
  line_number integer NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_chess_code text,
  description text NOT NULL DEFAULT '',
  line_type text,
  quantity numeric(18, 6) NOT NULL DEFAULT 0,
  remainder_quantity numeric(18, 6) NOT NULL DEFAULT 0,
  weight numeric(18, 6) NOT NULL DEFAULT 0,
  unit_price numeric(18, 6) NOT NULL DEFAULT 0,
  discount_percentage numeric(9, 4) NOT NULL DEFAULT 0,
  discount_amount numeric(18, 6) NOT NULL DEFAULT 0,
  net_amount numeric(18, 6) NOT NULL DEFAULT 0,
  tax_iva_1 numeric(18, 6) NOT NULL DEFAULT 0,
  tax_iva_2 numeric(18, 6) NOT NULL DEFAULT 0,
  total_amount numeric(18, 6) NOT NULL DEFAULT 0,
  cancelled boolean NOT NULL DEFAULT false,
  generic_merchandise boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_sales_items_document_org_fkey
    FOREIGN KEY (historical_document_id, organization_id)
    REFERENCES public.historical_sales_documents(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT historical_sales_document_items_line_unique
    UNIQUE (historical_document_id, line_number)
);

CREATE INDEX IF NOT EXISTS historical_sales_items_org_product_idx
  ON public.historical_sales_document_items (organization_id, product_id);
CREATE INDEX IF NOT EXISTS historical_sales_items_org_code_idx
  ON public.historical_sales_document_items (organization_id, product_chess_code);

CREATE TABLE IF NOT EXISTS public.historical_sales_document_links (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL,
  target_document_id uuid,
  target_source_key text NOT NULL,
  target_document_code text NOT NULL,
  target_letter text NOT NULL DEFAULT '',
  target_series integer NOT NULL DEFAULT 0,
  target_number integer NOT NULL,
  target_line_number integer,
  target_product_chess_code text,
  target_description text,
  relation_type text NOT NULL,
  related_quantity numeric(18, 6),
  source_snapshot_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_sales_links_source_org_fkey
    FOREIGN KEY (source_document_id, organization_id)
    REFERENCES public.historical_sales_documents(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT historical_sales_document_links_unique
    UNIQUE (source_document_id, target_source_key, target_line_number, relation_type)
);

CREATE INDEX IF NOT EXISTS historical_sales_document_links_org_target_idx
  ON public.historical_sales_document_links (organization_id, target_source_key);

-- Reporting surface: credit notes reverse the original product quantities and
-- values; generic MERCADERIA lines stay out of SKU-level analytics.
CREATE OR REPLACE VIEW public.historical_sales_product_report
WITH (security_invoker = true)
AS
SELECT
  document.organization_id,
  document.id AS historical_document_id,
  document.source_key,
  document.document_date,
  document.document_code,
  document.document_class,
  document.customer_id,
  item.product_id,
  item.product_chess_code,
  item.description AS product_description,
  item.quantity * document.revenue_sign AS signed_quantity,
  item.remainder_quantity * document.revenue_sign AS signed_remainder_quantity,
  item.weight * document.revenue_sign AS signed_weight,
  item.total_amount * document.revenue_sign AS signed_total_amount
FROM public.historical_sales_documents AS document
JOIN public.historical_sales_document_items AS item
  ON item.historical_document_id = document.id
 AND item.organization_id = document.organization_id
WHERE document.cancelled = false
  AND item.cancelled = false
  AND item.generic_merchandise = false;

GRANT SELECT ON public.historical_sales_product_report TO authenticated;

CREATE OR REPLACE FUNCTION public.get_historical_sales_product_metrics(
  p_org_id uuid,
  p_date_from date,
  p_date_to date,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  product_id uuid,
  product_chess_code text,
  product_name text,
  signed_quantity numeric,
  signed_remainder_quantity numeric,
  signed_amount numeric,
  document_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    report.product_id,
    report.product_chess_code,
    COALESCE(product.name, report.product_description) AS product_name,
    SUM(report.signed_quantity)::numeric AS signed_quantity,
    SUM(report.signed_remainder_quantity)::numeric AS signed_remainder_quantity,
    SUM(report.signed_total_amount)::numeric AS signed_amount,
    COUNT(DISTINCT report.historical_document_id)::bigint AS document_count
  FROM public.historical_sales_product_report AS report
  LEFT JOIN public.products AS product
    ON product.id = report.product_id
   AND product.organization_id = report.organization_id
  WHERE report.organization_id = p_org_id
    AND report.document_date >= p_date_from
    AND report.document_date <= p_date_to
  GROUP BY report.product_id, report.product_chess_code, product.name, report.product_description
  ORDER BY SUM(report.signed_total_amount) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_historical_sales_product_metrics(uuid, date, date, integer)
  TO authenticated, service_role;

ALTER TABLE public.historical_sales_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_sales_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_sales_document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historical_sales_documents_read ON public.historical_sales_documents;
CREATE POLICY historical_sales_documents_read ON public.historical_sales_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = historical_sales_documents.organization_id
      AND om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS historical_sales_document_items_read ON public.historical_sales_document_items;
CREATE POLICY historical_sales_document_items_read ON public.historical_sales_document_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = historical_sales_document_items.organization_id
      AND om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS historical_sales_document_links_read ON public.historical_sales_document_links;
CREATE POLICY historical_sales_document_links_read ON public.historical_sales_document_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = historical_sales_document_links.organization_id
      AND om.user_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE ON public.historical_sales_documents FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.historical_sales_document_items FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.historical_sales_document_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.historical_sales_documents TO authenticated;
GRANT SELECT ON public.historical_sales_document_items TO authenticated;
GRANT SELECT ON public.historical_sales_document_links TO authenticated;
GRANT ALL ON public.historical_sales_documents TO service_role;
GRANT ALL ON public.historical_sales_document_items TO service_role;
GRANT ALL ON public.historical_sales_document_links TO service_role;

COMMENT ON TABLE public.historical_sales_documents IS
  'Comprobantes CHESS de solo lectura, separados de ventas operativas.';
COMMENT ON TABLE public.historical_sales_document_items IS
  'Líneas de productos de comprobantes CHESS; no disparan stock ni movimientos operativos.';
COMMENT ON TABLE public.historical_sales_document_links IS
  'Vínculos explícitos CHESS entre NC y documento/línea original.';
