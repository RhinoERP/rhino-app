import type { SupabaseClient } from "@supabase/supabase-js";
import { findUniqueSlug, generateSlug } from "@/modules/admin/utils/slug.utils";

/**
 * Checks if the slug column exists in the organizations table
 */
async function checkSlugColumnExists(
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  try {
    const { error: slugCheckError } = await supabaseAdmin
      .from("organizations")
      .select("slug")
      .limit(1);

    return !slugCheckError?.message.includes("column");
  } catch {
    return false;
  }
}

/**
 * Gets the unique slug for an organization name
 */
async function getUniqueSlug(
  orgName: string,
  supabaseAdmin: SupabaseClient
): Promise<string | undefined> {
  const baseSlug = generateSlug(orgName);
  const slugColumnExists = await checkSlugColumnExists(supabaseAdmin);

  if (!slugColumnExists) {
    return;
  }

  return findUniqueSlug(baseSlug, async (slug) => {
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    return !!data;
  });
}

/**
 * Creates or finds the admin role for an organization
 */
async function getOrCreateAdminRole(
  organizationId: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  const { data: existingRole } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("key", "admin")
    .maybeSingle();

  if (existingRole) {
    return existingRole.id;
  }

  // Create admin role if it doesn't exist
  const { data: newRole, error: roleError } = await supabaseAdmin
    .from("roles")
    .insert({
      organization_id: organizationId,
      key: "admin",
      name: "Administrador",
      description: "Rol de administrador de la organización",
    })
    .select("id")
    .single();

  if (roleError || !newRole) {
    throw new Error(
      `Error creating admin role: ${roleError?.message ?? "Unknown error"}`
    );
  }

  return newRole.id;
}

export { getUniqueSlug, getOrCreateAdminRole };
