import { createAdminClient } from "@/lib/supabase/admin-client";
import type { Organization } from "@/modules/organizations/service/organizations.service";
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

  // 4) Create admin user and send invitation email automatically
  const { data: userRes, error: userError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail);

  if (userError || !userRes?.user) {
    throw userError ?? new Error("Error creating admin user");
  }

  const adminUserId = userRes.user.id;

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

  const organization: Organization = {
    id: orgRes.id,
    name: orgRes.name,
    cuit: orgRes.cuit ?? null,
    created_at: orgRes.created_at ?? null,
    slug: (orgRes as Partial<Organization>).slug ?? null,
  };

  return {
    organizationId: orgRes.id,
    adminUserId,
    organization,
  };
}
