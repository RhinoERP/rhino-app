-- Add columns to store PDF URLs for remittos and invoices
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS remittance_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;

-- Create storage bucket for sales documents (remittos + invoices)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Helper: the first folder segment of the object name is the organization slug
-- e.g. "{orgSlug}/{saleId}/{type}/{filename}"

-- Policies for the bucket (scoped to the caller's organizations)
CREATE POLICY "Members can upload sales documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.organization_members om
        ON om.organization_id = o.id
      WHERE o.slug = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

CREATE POLICY "Members can update sales documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.organization_members om
        ON om.organization_id = o.id
      WHERE o.slug = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

CREATE POLICY "Members can delete sales documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.organization_members om
        ON om.organization_id = o.id
      WHERE o.slug = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.is_active = true
    )
  );

-- Bucket is public, so anyone with the URL can view (needed for preview/download)
CREATE POLICY "Public can view sales documents"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'documents');
