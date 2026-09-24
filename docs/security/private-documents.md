# Private documents bucket

The `documents` bucket contains remittances, receipts, payment invoices, and
supplier invoices. Objects are private and Storage RLS limits access to active
members of the organization identified by the first path segment.

## Stored references

New records store the object path, for example:

```text
acme/payment-id/facturas_proveedor/factura.pdf
```

The application also accepts historical Supabase public URLs and extracts the
same object path at read time. No backfill is required before making the bucket
private.

Browser previews request a signed URL that expires after five minutes. Server
downloads use the authenticated Supabase client directly. Service-role keys
must not be used for user document reads because they bypass Storage RLS.

## Deployment order

1. Deploy the application code that supports object paths and historical URLs.
2. Apply `20260923000000_make_documents_bucket_private.sql`.
3. Verify preview and download flows for each document family with an active
   organization member.
4. Verify that an inactive or disabled member cannot create a signed URL or
   download an object.

## Verification

Confirm that `storage.buckets.public` is `false` for `documents` and that the
bucket has authenticated `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies.
Each policy must require both `organization_members.is_active = true` and
`organization_members.disabled_at IS NULL`.

Historical public URLs must return an unauthorized response when requested
directly. The same database value must continue to work through an application
preview or download action.

## Rollback

If application reads fail after the migration, restore availability while the
application issue is corrected by setting the bucket to public and recreating
the former public `SELECT` policy. This temporarily restores the original
exposure, so remove the policy and mark the bucket private again as soon as the
signed access flow is healthy.
