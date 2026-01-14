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

async function assignAllPermissionsToRole(
  roleId: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  const { data: permissions } = await supabaseAdmin
    .from("permissions")
    .select("id");

  if (!permissions || permissions.length === 0) {
    return;
  }

  const rolePermissions = permissions.map((perm) => ({
    role_id: roleId,
    permission_id: perm.id,
  }));

  const { error: permissionsError } = await supabaseAdmin
    .from("role_permissions")
    .insert(rolePermissions);

  if (permissionsError) {
    throw new Error(
      `Error assigning permissions to admin role: ${permissionsError.message}`
    );
  }
}

async function roleHasPermissions(
  roleId: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  const { data: existingPermissions } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", roleId)
    .limit(1);

  return existingPermissions !== null && existingPermissions.length > 0;
}

async function createAdminRole(
  organizationId: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
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

  await assignAllPermissionsToRole(newRole.id, supabaseAdmin);

  return newRole.id;
}

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
    const hasPermissions = await roleHasPermissions(
      existingRole.id,
      supabaseAdmin
    );

    if (!hasPermissions) {
      await assignAllPermissionsToRole(existingRole.id, supabaseAdmin);
    }

    return existingRole.id;
  }

  return createAdminRole(organizationId, supabaseAdmin);
}

async function createSellerRole(
  organizationId: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  const { data: existingRole } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("key", "seller")
    .maybeSingle();

  if (existingRole) {
    return existingRole.id;
  }

  const { data: newRole, error: roleError } = await supabaseAdmin
    .from("roles")
    .insert({
      organization_id: organizationId,
      key: "vendedor",
      name: "Vendedor",
      description: "Rol de vendedor de la empresa.",
    })
    .select("id")
    .single();

  if (roleError || !newRole) {
    throw new Error(
      `Error creating seller role: ${roleError?.message ?? "Unknown error"}`
    );
  }

  const { data: permissions } = await supabaseAdmin
    .from("permissions")
    .select("id")
    .in("key", [
      "inventory.read",
      "sales.read",
      "sales.manage",
      "clients.read",
    ]);

  if (permissions && permissions.length > 0) {
    const rolePermissions = permissions.map((perm) => ({
      role_id: newRole.id,
      permission_id: perm.id,
    }));

    const { error: permissionsError } = await supabaseAdmin
      .from("role_permissions")
      .insert(rolePermissions);

    if (permissionsError) {
      throw new Error(
        `Error assigning permissions to seller role: ${permissionsError.message}`
      );
    }
  }

  return newRole.id;
}

export { getUniqueSlug, getOrCreateAdminRole, createSellerRole };
