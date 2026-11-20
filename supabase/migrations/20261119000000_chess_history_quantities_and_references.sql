-- Follow-up to the already-applied CHESS history migration.
-- Preserve raw quantities and the presentation snapshot used for normalization.
ALTER TABLE public.historical_sales_documents
  ADD COLUMN IF NOT EXISTS is_reference_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.historical_sales_document_items
  ADD COLUMN IF NOT EXISTS units_per_box numeric(18,6) CHECK (units_per_box > 0),
  ADD COLUMN IF NOT EXISTS base_unit_quantity numeric(18,6),
  ADD COLUMN IF NOT EXISTS quantity_source text;

COMMENT ON COLUMN public.historical_sales_documents.is_reference_only IS
  'Original fuera del período, descargado para consultar un vínculo NC; excluido de métricas.';
COMMENT ON COLUMN public.historical_sales_document_items.base_unit_quantity IS
  'cant × units_per_box + resto, usando la presentación del export CHESS. NULL si no está verificada.';
COMMENT ON COLUMN public.historical_sales_document_items.quantity_source IS
  'Procedencia de la presentación conservada; CHESS_PRESENTATIONS_EXPORT para el piloto.';

-- Keep the existing view columns in their original order and append the new
-- normalized quantity, so existing consumers of raw CHESS quantities still work.
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
  item.total_amount * document.revenue_sign AS signed_total_amount,
  item.base_unit_quantity * document.revenue_sign AS signed_base_unit_quantity
FROM public.historical_sales_documents AS document
JOIN public.historical_sales_document_items AS item
  ON item.historical_document_id = document.id
 AND item.organization_id = document.organization_id
WHERE document.cancelled = false
  AND document.is_reference_only = false
  AND item.cancelled = false
  AND item.generic_merchandise = false;

-- Same RPC contract: signed_quantity now means base units, not boxes. If any
-- quantity is unknown, expose NULL rather than silently understating a product.
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
    COALESCE(MAX(product.name), MAX(report.product_description)) AS product_name,
    CASE WHEN COUNT(*) = COUNT(report.signed_base_unit_quantity)
      THEN SUM(report.signed_base_unit_quantity) ELSE NULL END::numeric AS signed_quantity,
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
  GROUP BY report.product_id, report.product_chess_code
  ORDER BY SUM(report.signed_total_amount) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

GRANT SELECT ON public.historical_sales_product_report TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_historical_sales_product_metrics(uuid, date, date, integer)
  TO authenticated, service_role;
