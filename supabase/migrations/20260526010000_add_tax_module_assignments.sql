-- ============================================================
-- Migration: Tax Module Assignments + Catalog Support
-- ============================================================

-- 1. Extend taxes table with:
--    - Module assignment flags (credit notes, debit notes)
--    - Catalog metadata (category, province, preset key)

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS is_favorite_credit_notes  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_favorite_debit_notes   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalog_category          text,   -- 'iva' | 'iibb' | 'percepcion_iibb' | 'retencion_iibb' | 'retencion_nacional' | 'sellos' | 'municipal'
  ADD COLUMN IF NOT EXISTS catalog_province          text,   -- Province name (null for national taxes)
  ADD COLUMN IF NOT EXISTS catalog_key               text;   -- Unique catalog identifier, e.g. 'IIBB_SANTA_FE'

-- Prevent importing the same catalog tax twice per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxes_org_catalog_key
  ON public.taxes (organization_id, catalog_key)
  WHERE catalog_key IS NOT NULL;

-- 2. Extend TaxFavoriteContext to support credit/debit notes
--    (handled at app level — no DB enum needed)

COMMENT ON COLUMN public.taxes.catalog_category IS
  'Category of preset catalog tax: iva | iibb | percepcion_iibb | retencion_iibb | retencion_nacional | sellos | municipal';

COMMENT ON COLUMN public.taxes.catalog_province IS
  'Argentine province name for provincial taxes (IIBB, percepciones, retenciones, sellos). NULL for national taxes.';

COMMENT ON COLUMN public.taxes.catalog_key IS
  'Unique key from the preset catalog, e.g. IIBB_SANTA_FE_3. Used to prevent duplicate imports.';
