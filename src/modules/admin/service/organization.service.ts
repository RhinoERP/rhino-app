import { createAdminClient } from "@/lib/supabase/admin-client";
import type { Organization } from "@/modules/organizations/types";
import { getOrCreateAdminRole, getUniqueSlug } from "./organization-helpers";

export type CreateOrganizationParams = {
  orgName: string;
  adminEmail: string;
  cuit: string;
};

export type CreateOrganizationResult = {
  organizationId: string;
  adminUserId: string;
  organization: Organization;
};

/**
 * Gets or creates a user by email, handling existing users
 */
async function getOrCreateUserByEmail(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string> {
  // First, check if user already exists
  const { data: usersData, error: listError } =
    await supabaseAdmin.auth.admin.listUsers();

  if (listError) {
    throw new Error(`Error fetching users: ${listError.message}`);
  }

  const existingUser = usersData.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );

  if (existingUser) {
    return existingUser.id;
  }

  // User doesn't exist, create and invite them
  const { data: userRes, error: userError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invite`,
    });

  if (userError || !userRes?.user) {
    throw userError ?? new Error("Error creating admin user");
  }

  return userRes.user.id;
}

/**
 * Creates an organization with an admin user
 * Only accessible by superadmins
 */
export async function createOrganizationWithAdmin({
  orgName,
  adminEmail,
  cuit,
}: CreateOrganizationParams): Promise<CreateOrganizationResult> {
  const supabaseAdmin = createAdminClient();

  // 1) Generate unique slug (if slug column exists)
  const uniqueSlug = await getUniqueSlug(orgName, supabaseAdmin);

  // 2) Create organization
  const insertData: {
    name: string;
    cuit: string;
    slug?: string;
  } = {
    name: orgName,
    cuit,
  };

  if (uniqueSlug) {
    insertData.slug = uniqueSlug;
  }

  const { data: orgRes, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert(insertData)
    .select("id, name, cuit, created_at, slug")
    .single();

  if (orgError) {
    throw new Error(`Error creating organization: ${orgError.message}`);
  }

  // 3) Create or find admin role for the organization
  const adminRoleId = await getOrCreateAdminRole(orgRes.id, supabaseAdmin);

  // 4) Get or create admin user (handles existing users)
  const adminUserId = await getOrCreateUserByEmail(supabaseAdmin, adminEmail);

  // 5) Assign membership as owner/admin
  const { error: memberError } = await supabaseAdmin
    .from("organization_members")
    .insert({
      user_id: adminUserId,
      organization_id: orgRes.id,
      role_id: adminRoleId,
      is_owner: true,
    });

  if (memberError) {
    throw new Error(`Error creating membership: ${memberError.message}`);
  }

  return {
    organizationId: orgRes.id,
    adminUserId,
    organization: orgRes as Organization,
  };
}
