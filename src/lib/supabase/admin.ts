import { createClient } from "@/lib/supabase/server";

/**
 * Checks if the current user is a platform superadmin
 * by querying the platform_admins table in Supabase
 */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();

  // Get the current user
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (!userId) {
    return false;
  }

  // Check if the user exists in the platform_admins table
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return !error && !!data;
}

/**
 * Gets the current user ID from the session
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub || null;
}

/**
 * Gets the current user's authentication data
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims || null;
}

