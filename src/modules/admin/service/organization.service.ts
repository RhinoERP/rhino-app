import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import type { Organization } from "@/modules/organizations/types";
import type { Database } from "@/types/supabase";
import { getOrCreateAdminRole, getUniqueSlug } from "./organization-helpers";

export type CreateOrganizationParams = {
  orgName: string;
  adminEmail: string;
  cuit: string;
  supabaseClient: SupabaseClient<Database>;
};

export type CreateOrganizationResult = {
  organizationId: string;
  invitationToken: string;
  organization: Organization;
};

/**
 * Creates an organization with an admin invitation
 * Only accessible by superadmins
 */
export async function createOrganizationWithAdmin({
  orgName,
  adminEmail,
  cuit,
  supabaseClient,
}: CreateOrganizationParams): Promise<CreateOrganizationResult> {
  const supabaseAdmin = createAdminClient();

  const uniqueSlug = await getUniqueSlug(orgName, supabaseAdmin);

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

  const adminRoleId = await getOrCreateAdminRole(orgRes.id, supabaseAdmin);

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user?.id) {
    throw new Error("No se pudo obtener el usuario actual de la sesión");
  }

  const { data: invitationData, error: invitationError } = await supabaseClient
    .from("organization_invitations")
    .insert({
      organization_id: orgRes.id,
      role_id: adminRoleId,
      invited_email: adminEmail.trim().toLowerCase(),
      is_owner: true,
      invitation_type: "one_time",
      invited_by_user_id: user.id,
    })
    .select("token")
    .single();

  if (invitationError) {
    throw new Error(`Error creating invitation: ${invitationError.message}`);
  }

  if (!invitationData?.token) {
    throw new Error("Error: no se generó el token de invitación");
  }

  return {
    organizationId: orgRes.id,
    invitationToken: invitationData.token,
    organization: orgRes as Organization,
  };
}
