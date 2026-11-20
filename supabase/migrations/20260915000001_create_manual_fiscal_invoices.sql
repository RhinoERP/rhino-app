-- Fiscal documents issued outside the commercial sales flow. They never
-- participate in stock, orders or remittances.
-- The supplier-invoice service already supports this field. Older databases
-- may have been created before its migration was added.
ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6);

CREATE TABLE IF NOT EXISTS public.manual_fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  created_by uuid REFERENCES auth.users(id),
  issue_date date NOT NULL DEFAULT current_date,
  due_date date,
  invoice_type public.invoice_type NOT NULL DEFAULT 'FACTURA_B',
  currency text NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  exchange_rate numeric(18,6),
  sub_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (sub_total >= 0),
  total_tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_tax_amount >= 0),
  total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  custom_message text,
  email_recipients text,
  email_subject text,
  email_body text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'authorized', 'error')),
  invoice_number text,
  arca_cae text,
  arca_cae_expires_at timestamptz,
  arca_authorized_at timestamptz,
  arca_point_of_sale integer,
  arca_voucher_number integer,
  arca_voucher_type_code integer,
  arca_last_error text,
  arca_request_json jsonb,
  arca_response_json jsonb,
  accounting_informal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_fiscal_invoices_usd_quote_check
    CHECK (currency <> 'USD' OR exchange_rate IS NOT NULL AND exchange_rate > 0)
);

CREATE TABLE IF NOT EXISTS public.manual_fiscal_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_fiscal_invoice_id uuid NOT NULL REFERENCES public.manual_fiscal_invoices(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(trim(description)) > 0),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  iva_rate numeric(5,2) NOT NULL CHECK (iva_rate IN (0, 10.5, 21, 27)),
  net_amount numeric(14,2) NOT NULL CHECK (net_amount >= 0),
  tax_amount numeric(14,2) NOT NULL CHECK (tax_amount >= 0),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_fiscal_invoices_org_issue_date_idx
  ON public.manual_fiscal_invoices (organization_id, issue_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS manual_fiscal_invoices_arca_voucher_unique
  ON public.manual_fiscal_invoices (organization_id, arca_point_of_sale, arca_voucher_type_code, arca_voucher_number)
  WHERE arca_point_of_sale IS NOT NULL AND arca_voucher_type_code IS NOT NULL AND arca_voucher_number IS NOT NULL;

ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS manual_fiscal_invoice_id uuid REFERENCES public.manual_fiscal_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.accounts_receivable
  ALTER COLUMN sales_order_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_receivable_manual_fiscal_invoice_unique
  ON public.accounts_receivable (manual_fiscal_invoice_id)
  WHERE manual_fiscal_invoice_id IS NOT NULL;
ALTER TABLE public.accounts_receivable
  DROP CONSTRAINT IF EXISTS accounts_receivable_document_source_check;
ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_document_source_check CHECK (
    (sales_order_id IS NOT NULL AND manual_fiscal_invoice_id IS NULL)
    OR (sales_order_id IS NULL AND manual_fiscal_invoice_id IS NOT NULL)
  );

ALTER TABLE public.manual_fiscal_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_fiscal_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_fiscal_invoices_read ON public.manual_fiscal_invoices;
DROP POLICY IF EXISTS manual_fiscal_invoices_write ON public.manual_fiscal_invoices;
DROP POLICY IF EXISTS manual_fiscal_invoice_items_read ON public.manual_fiscal_invoice_items;
DROP POLICY IF EXISTS manual_fiscal_invoice_items_write ON public.manual_fiscal_invoice_items;

CREATE POLICY manual_fiscal_invoices_read ON public.manual_fiscal_invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = manual_fiscal_invoices.organization_id AND om.user_id = auth.uid()));
CREATE POLICY manual_fiscal_invoices_write ON public.manual_fiscal_invoices FOR ALL
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = manual_fiscal_invoices.organization_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = manual_fiscal_invoices.organization_id AND om.user_id = auth.uid()));
CREATE POLICY manual_fiscal_invoice_items_read ON public.manual_fiscal_invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.manual_fiscal_invoices i JOIN public.organization_members om ON om.organization_id = i.organization_id WHERE i.id = manual_fiscal_invoice_id AND om.user_id = auth.uid()));
CREATE POLICY manual_fiscal_invoice_items_write ON public.manual_fiscal_invoice_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.manual_fiscal_invoices i JOIN public.organization_members om ON om.organization_id = i.organization_id WHERE i.id = manual_fiscal_invoice_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.manual_fiscal_invoices i JOIN public.organization_members om ON om.organization_id = i.organization_id WHERE i.id = manual_fiscal_invoice_id AND om.user_id = auth.uid()));
