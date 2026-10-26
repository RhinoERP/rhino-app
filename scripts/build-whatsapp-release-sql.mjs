import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)),
    "utf8"
  );

// A targeted transaction avoids the repository's historical duplicate migration
// versions. It does not modify Supabase's migration history or other modules.
const foundation = migration(
  "20260902000000_create_whatsapp_agent_foundation.sql"
);
const subsequent = [
  "20260902010000_add_whatsapp_channel_functions.sql",
  "20260907000000_prevent_duplicate_whatsapp_pre_sales.sql",
  "20261017010000_whatsapp_business_hours_and_response_delay.sql",
  "20261026000000_gate_whatsapp_modules.sql",
].map(migration);

process.stdout.write(`-- WhatsApp release: run as postgres in the intended project.
-- Review this generated SQL before executing; it never enables a tenant.
BEGIN;
DO $whatsapp_release$
DECLARE
  existing_tables integer;
BEGIN
  SELECT count(*) INTO existing_tables
  FROM unnest(ARRAY[
    'whatsapp_integrations', 'whatsapp_integration_secrets',
    'whatsapp_conversations', 'whatsapp_messages', 'conversation_carts',
    'conversation_cart_items', 'agent_jobs', 'agent_runs'
  ]) AS required_table(name)
  WHERE to_regclass('public.' || name) IS NOT NULL;
  IF existing_tables = 0 THEN
    EXECUTE $whatsapp_foundation$
${foundation}
    $whatsapp_foundation$;
  ELSIF existing_tables <> 8 THEN
    RAISE EXCEPTION 'Partial WhatsApp foundation detected (% of 8 tables). Inspect before deploying.', existing_tables;
  END IF;
END;
$whatsapp_release$;
${subsequent.join("\n")}
COMMIT;
`);
