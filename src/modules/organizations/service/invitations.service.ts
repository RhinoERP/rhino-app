import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { getOrganizationBySlug } from "./organizations.service";

type InvitationType = Database["public"]["Enums"]["invitation_type"];
type OrganizationInvitationRow =
  Database["public"]["Tables"]["organization_invitations"]["Row"];

type CreateInvitationRpcResult = Pick<
  OrganizationInvitationRow,
  "token" | "expires_at"
>;

export type CreateInvitationParams = {
  orgSlug: string;
  invitedEmail: string;
  roleId: string;
  invitationType?: InvitationType;
  isOwner?: boolean;
};

export type CreateInvitationResult = {
  token: string;
  expiresAt: string;
};

export type OrganizationInvitation = OrganizationInvitationRow & {
  role?: {
    id: string;
    name: string;
    key: string;
  };
  invited_by?: {
    id: string;
    email: string | null;
    name: string | null;
  };
};

/**
 * Creates an organization invitation using the RPC function
 * @param params - Invitation parameters
 * @returns The invitation token and ID
 */
export async function createOrganizationInvitation(
  params: CreateInvitationParams
): Promise<CreateInvitationResult> {
  const supabase = await createClient();

  if (!params.invitedEmail?.trim()) {
    throw new Error("El email del invitado es requerido");
  }

  if (!params.roleId?.trim()) {
    throw new Error("El rol es requerido");
  }

  const organization = await getOrganizationBySlug(params.orgSlug);

  if (!organization) {
    throw new Error("Organización no encontrada");
  }

  const normalizedEmail = params.invitedEmail.trim().toLowerCase();

  const { data, error } = await supabase.rpc("create_organization_invitation", {
    p_organization_id: organization.id,
    p_invited_email: normalizedEmail,
    p_role_id: params.roleId,
    p_invitation_type: params.invitationType ?? "one_time",
    p_is_owner: params.isOwner ?? false,
  });

  if (error) {
    throw new Error(`Error creando invitación: ${error.message}`);
  }

  const result = data as CreateInvitationRpcResult;

  return {
    token: result.token,
    expiresAt: result.expires_at,
  };
}

/**
 * Gets all active invitations for an organization by slug
 * Active invitations are those that:
 * - Have not expired (expires_at > now())
 * - The invited email is not already a member of the organization
 */
export async function getActiveInvitationsBySlug(
  orgSlug: string
): Promise<OrganizationInvitation[]> {
  const supabase = await createClient();
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    return [];
  }

  // Get all active invitations (not expired) with roles
  const { data: invitations, error: invitationsError } = await supabase
    .from("organization_invitations")
    .select(
      `
      *,
      role:roles(id, name, key)
    `
    )
    .eq("organization_id", organization.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (invitationsError) {
    throw new Error(
      `Error obteniendo invitaciones: ${invitationsError.message}`
    );
  }

  if (!invitations || invitations.length === 0) {
    return [];
  }

  // Note: We're not filtering by existing members here since we can't easily
  // query auth.users to get member emails. The filtering can be done at the
  // application level if needed, or we can enhance this later with admin client.

  // For now, we'll return invitations without the invited_by details
  // This can be enhanced later with admin client if needed
  const roleIds = [
    ...new Set(invitations.map((inv) => inv.role_id).filter(Boolean)),
  ];

  // Get roles
  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id, name, key")
    .in("id", roleIds);

  if (rolesError) {
    throw new Error(`Error obteniendo roles: ${rolesError.message}`);
  }

  const rolesMap = new Map((roles || []).map((role) => [role.id, role]));

  // Map invitations with roles
  return invitations.map((inv) => {
    const role = rolesMap.get(inv.role_id);

    return {
      ...inv,
      role: role
        ? {
            id: role.id,
            name: role.name,
            key: role.key,
          }
        : undefined,
      invited_by: undefined,
    } as OrganizationInvitation;
  });
}

/**
 * Cancels (deletes) an invitation by ID
 */
export async function cancelInvitation(
  invitationId: string,
  orgSlug: string
): Promise<void> {
  const supabase = await createClient();
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    throw new Error("Organización no encontrada");
  }

  const { data: invitation, error: checkError } = await supabase
    .from("organization_invitations")
    .select("id, organization_id")
    .eq("id", invitationId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Error verificando invitación: ${checkError.message}`);
  }

  if (!invitation) {
    throw new Error("Invitación no encontrada");
  }

  const { error: deleteError } = await supabase
    .from("organization_invitations")
    .delete()
    .eq("id", invitationId);

  if (deleteError) {
    throw new Error(`Error cancelando invitación: ${deleteError.message}`);
  }
}
