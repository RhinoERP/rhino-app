-- Store only object paths in application records and issue short-lived signed
-- URLs after Storage RLS authorizes the authenticated organization member.
UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

DROP POLICY IF EXISTS "Public can view sales documents" ON storage.objects;
DROP POLICY IF EXISTS "Members can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload sales documents" ON storage.objects;
DROP POLICY IF EXISTS "Members can update sales documents" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete sales documents" ON storage.objects;

CREATE POLICY "Members can view documents"
  ON storage.objects FOR SELECT TO authenticated
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
        AND om.disabled_at IS NULL
    )
  );

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
        AND om.disabled_at IS NULL
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
        AND om.disabled_at IS NULL
    )
  )
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
        AND om.disabled_at IS NULL
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
        AND om.disabled_at IS NULL
    )
  );
