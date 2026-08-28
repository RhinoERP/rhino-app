-- Supplier invoices are the fiscal documents received from suppliers.
-- They are intentionally separate from purchase orders: one order may be
-- invoiced in installments and an invoice can be recorded before goods arrive.

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_type TEXT NOT NULL,
  point_of_sale TEXT,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  subtotal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL DEFAULT 'REGISTERED'
    CHECK (status IN ('REGISTERED', 'CANCELLED')),
  invoice_pdf_url TEXT,
  invoice_filename TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT supplier_invoices_document_unique
    UNIQUE (organization_id, supplier_id, invoice_type, point_of_sale, invoice_number)
);

CREATE INDEX IF NOT EXISTS supplier_invoices_organization_date_idx
  ON public.supplier_invoices (organization_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS supplier_invoices_purchase_order_idx
  ON public.supplier_invoices (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

CREATE TRIGGER update_supplier_invoices_updated_at
  BEFORE UPDATE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_invoices_org_member_access
  ON public.supplier_invoices
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = supplier_invoices.organization_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = supplier_invoices.organization_id
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );
