-- Minimal operational schema; document tables and persistence functions below
-- are loaded from the actual application migrations, never replaced by stubs.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE unit_of_measure_type AS ENUM ('UN','KG');
CREATE TABLE organizations(id uuid PRIMARY KEY,cuit text,remittance_auto_enabled boolean DEFAULT false,remittance_prefix text DEFAULT 'REM',remittance_last_number bigint DEFAULT 100);
CREATE TABLE organization_settings(organization_id uuid PRIMARY KEY REFERENCES organizations(id),settings jsonb NOT NULL DEFAULT '{}',updated_at timestamptz);
CREATE TABLE roles(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id));
CREATE TABLE permissions(id uuid PRIMARY KEY,key text NOT NULL UNIQUE);
CREATE TABLE role_permissions(role_id uuid REFERENCES roles(id),permission_id uuid REFERENCES permissions(id));
CREATE TABLE organization_members(organization_id uuid REFERENCES organizations(id),user_id uuid REFERENCES auth.users(id),role_id uuid REFERENCES roles(id),is_active boolean DEFAULT true,is_owner boolean DEFAULT true);
CREATE FUNCTION user_has_org_permission(p_key text,p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=p_org AND m.user_id=auth.uid() AND m.is_active AND m.is_owner)
$$;
CREATE TABLE customers(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id));
CREATE TABLE carriers(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id));
CREATE TABLE quotes(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),customer_id uuid REFERENCES customers(id));
CREATE TABLE sales_orders(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),carrier_id uuid REFERENCES carriers(id),remittance_number text);
CREATE TABLE orders(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),parent_order_id uuid REFERENCES orders(id),quote_id uuid REFERENCES quotes(id),sales_order_id uuid REFERENCES sales_orders(id),created_by uuid REFERENCES auth.users(id),status text DEFAULT 'PREPARING');
CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id));
CREATE TABLE product_variants(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),product_id uuid REFERENCES products(id));
CREATE TABLE quote_items(id uuid PRIMARY KEY,quote_id uuid REFERENCES quotes(id),assigned_order_id uuid REFERENCES orders(id),product_id uuid REFERENCES products(id),product_variant_id uuid REFERENCES product_variants(id),quantity numeric NOT NULL);
CREATE TABLE quote_item_extras(id uuid PRIMARY KEY,quote_item_id uuid REFERENCES quote_items(id));
CREATE TABLE sales_order_items(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),quote_item_id uuid REFERENCES quote_items(id));
CREATE TABLE order_dispatch_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),dispatch_group_id uuid,remito_number text);
