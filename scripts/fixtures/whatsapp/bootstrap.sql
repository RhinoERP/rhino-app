CREATE SCHEMA auth;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END; $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_active boolean DEFAULT true);
CREATE TABLE platform_admins (user_id uuid PRIMARY KEY);
CREATE TABLE customers (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id));
CREATE TABLE sales_orders (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id));
CREATE TABLE sales_price_lists (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id));
CREATE TABLE organization_members (user_id uuid REFERENCES auth.users(id), organization_id uuid REFERENCES organizations(id), is_active boolean DEFAULT true);
CREATE TABLE products (id uuid PRIMARY KEY);
CREATE TABLE product_variants (id uuid PRIMARY KEY);
CREATE TABLE permissions (key text PRIMARY KEY, description text);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
