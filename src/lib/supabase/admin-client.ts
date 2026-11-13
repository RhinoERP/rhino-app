import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Creates a Supabase admin client with service role key
 * WARNING: This client has full admin access. Only use in server-side code.
 */
function adminConfiguration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }

  return { supabaseUrl, serviceRoleKey };
}

const adminOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = adminConfiguration();
  return createClient(supabaseUrl, serviceRoleKey, adminOptions);
}

/** Typed variant for consumers of the generated database schema. */
export function createTypedAdminClient() {
  const { supabaseUrl, serviceRoleKey } = adminConfiguration();
  return createClient<Database>(supabaseUrl, serviceRoleKey, adminOptions);
}
