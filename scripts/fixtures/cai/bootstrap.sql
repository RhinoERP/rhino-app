CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TABLE organizations(id uuid PRIMARY KEY,cuit text,remittance_auto_enabled boolean DEFAULT false);
CREATE TABLE organization_settings(organization_id uuid PRIMARY KEY REFERENCES organizations(id),settings jsonb NOT NULL DEFAULT '{}',updated_at timestamptz);
CREATE TABLE orders(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id));
CREATE TABLE order_remittance_batches(id uuid PRIMARY KEY,dispatch_group_id uuid);
CREATE TABLE order_remittances(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),batch_id uuid REFERENCES order_remittance_batches(id),document_number text,issue_date date DEFAULT current_date,status text DEFAULT 'ISSUED',header_snapshot jsonb NOT NULL);
CREATE UNIQUE INDEX remittance_test_number ON order_remittances(organization_id,document_number);
CREATE TABLE order_dispatch_events(id uuid DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),dispatch_group_id uuid);
-- The production dispatcher is preserved by the migration. This fixture checks its
-- targeted upgrade without duplicating unrelated inventory/accounting schemas.
CREATE FUNCTION persist_order_remittance_documents_internal(p_org_id uuid,p_actor_id uuid,p_parent_order_id uuid,p_order_ids uuid[],p_idempotency_key uuid,p_expected_source_fingerprint text,p_automatic_numbering boolean,p_documents jsonb)
RETURNS TABLE(batch_id uuid,remittance_id uuid,document_number text,document_position integer)
LANGUAGE plpgsql AS $$ DECLARE v_org public.organizations%ROWTYPE; BEGIN
IF p_automatic_numbering AND NOT coalesce(v_org.remittance_auto_enabled, false) THEN RAISE EXCEPTION 'legacy'; END IF;
END; $$;
