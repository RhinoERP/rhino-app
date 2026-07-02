-- ============================================================
-- 20260630190000_add_category_accounting_rules.sql
-- Relaciona categorias de productos con account_code contable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.category_accounting_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT category_accounting_rules_org_category_unique
    UNIQUE (organization_id, category_id)
);

CREATE INDEX IF NOT EXISTS category_accounting_rules_org_idx
  ON public.category_accounting_rules (organization_id);

CREATE INDEX IF NOT EXISTS category_accounting_rules_category_idx
  ON public.category_accounting_rules (category_id);
