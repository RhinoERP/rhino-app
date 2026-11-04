-- Run with psql in an EMPTY, DISPOSABLE database. All fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.products(id uuid PRIMARY KEY, organization_id uuid, is_active boolean, name text, brand text, description text, category_id uuid);
CREATE TABLE public.categories(id uuid PRIMARY KEY, organization_id uuid, name text);
CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, organization_id uuid, status text,
  sale_date date, observations text, conversation_id uuid);
CREATE TABLE public.sales_order_items(id uuid DEFAULT gen_random_uuid(), organization_id uuid,
  sales_order_id uuid, product_id uuid, quantity numeric, unit_quantity numeric);
CREATE TABLE public.whatsapp_conversations(id uuid PRIMARY KEY, integration_id uuid);
CREATE TABLE public.whatsapp_integrations(id uuid PRIMARY KEY, phone_number_id text);

\ir ../migrations/20261030000000_whatsapp_product_recommendations.sql

INSERT INTO products VALUES
  (md5('p1')::uuid, md5('org-a')::uuid, true, 'Queso cremoso', NULL, NULL, NULL),
  (md5('p2')::uuid, md5('org-a')::uuid, true, 'Queso sardo', NULL, NULL, NULL),
  (md5('inactive')::uuid, md5('org-a')::uuid, false, 'Inactivo', NULL, NULL, NULL),
  (md5('foreign')::uuid, md5('org-b')::uuid, true, 'Ajeno', NULL, NULL, NULL);
INSERT INTO whatsapp_integrations VALUES (md5('simulator')::uuid, 'rhinos-local-simulator:test');
INSERT INTO whatsapp_conversations VALUES (md5('sim-chat')::uuid, md5('simulator')::uuid);

INSERT INTO sales_orders
SELECT md5(label)::uuid, md5(organization)::uuid, status, current_date - age,
  observations, CASE WHEN simulated_chat THEN md5('sim-chat')::uuid ELSE NULL END
FROM (VALUES
  ('sale-1', 'org-a', 'CONFIRMED', 1, '', false),
  ('sale-2', 'org-a', 'DISPATCH', 2, '', false),
  ('sale-3', 'org-a', 'DELIVERED', 30, '', false),
  ('draft', 'org-a', 'DRAFT', 1, '', false),
  ('cancelled', 'org-a', 'CANCELLED', 1, '', false),
  ('old', 'org-a', 'CONFIRMED', 91, '', false),
  ('future', 'org-a', 'CONFIRMED', -1, '', false),
  ('sim-notes', 'org-a', 'CONFIRMED', 1, '[SIMULACIÓN LOCAL] pedido', false),
  ('sim-chat', 'org-a', 'CONFIRMED', 1, '', true),
  ('foreign', 'org-b', 'CONFIRMED', 1, '', false)
) AS fixtures(label, organization, status, age, observations, simulated_chat);

INSERT INTO sales_order_items(organization_id, sales_order_id, product_id, quantity, unit_quantity)
SELECT md5(organization)::uuid, md5(sale)::uuid, md5(product)::uuid, quantity, NULL
FROM (VALUES
  ('org-a', 'sale-1', 'p1', 1),
  ('org-a', 'sale-1', 'p1', 4), -- two lines still count as ONE order
  ('org-a', 'sale-1', 'p2', 1),
  ('org-a', 'sale-2', 'p1', 1),
  ('org-a', 'sale-3', 'p1', 1),
  ('org-a', 'sale-3', 'p2', 1),
  ('org-a', 'draft', 'p2', 100),
  ('org-a', 'cancelled', 'p2', 100),
  ('org-a', 'old', 'p2', 100),
  ('org-a', 'future', 'p2', 100),
  ('org-a', 'sim-notes', 'p2', 100),
  ('org-a', 'sim-chat', 'p2', 100),
  ('org-a', 'sale-1', 'inactive', 100),
  ('org-a', 'sale-1', 'foreign', 100), -- malformed cross-tenant product link
  ('org-b', 'sale-1', 'p1', 100), -- malformed cross-tenant item link
  ('org-b', 'foreign', 'foreign', 1),
  ('org-a', 'foreign', 'p2', 100), -- malformed cross-tenant order link
  ('org-a', 'sale-2', 'p2', 0) -- zero quantity is not purchase evidence
) AS fixtures(organization, sale, product, quantity);

DO $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_object_agg(product_id::text, order_count) INTO result
    FROM whatsapp_product_recommendations(md5('org-a')::uuid);
  IF result IS DISTINCT FROM jsonb_build_object(md5('p1')::uuid::text, 3, md5('p2')::uuid::text, 2) THEN
    RAISE EXCEPTION 'Incorrect confirmed-order ranking or tenant isolation: %', result;
  END IF;

  SELECT jsonb_object_agg(product_id::text, order_count) INTO result
    FROM whatsapp_product_recommendations(md5('org-a')::uuid, 'queso cremoso');
  IF result IS DISTINCT FROM jsonb_build_object(md5('p1')::uuid::text, 3) THEN
    RAISE EXCEPTION 'Candidate filtering failed: %', result;
  END IF;

  SELECT jsonb_object_agg(product_id::text, order_count) INTO result
    FROM whatsapp_product_recommendations(md5('org-a')::uuid, NULL, md5('p1')::uuid);
  IF result IS DISTINCT FROM jsonb_build_object(md5('p2')::uuid::text, 2) THEN
    RAISE EXCEPTION 'Co-purchase evidence failed: %', result;
  END IF;

  SELECT jsonb_object_agg(product_id::text, order_count) INTO result
    FROM whatsapp_product_recommendations(md5('org-b')::uuid);
  IF result IS DISTINCT FROM jsonb_build_object(md5('foreign')::uuid::text, 1) THEN
    RAISE EXCEPTION 'Other organization evidence is incorrect: %', result;
  END IF;

  IF EXISTS(SELECT 1 FROM whatsapp_product_recommendations(md5('org-a')::uuid, NULL, md5('foreign')::uuid)) THEN
    RAISE EXCEPTION 'Cross-tenant anchor produced recommendations';
  END IF;
  IF has_function_privilege('authenticated', 'public.whatsapp_product_recommendations(uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.whatsapp_product_recommendations(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.whatsapp_product_recommendations(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Recommendation RPC is not restricted to trusted service calls';
  END IF;
END $$;
ROLLBACK;
