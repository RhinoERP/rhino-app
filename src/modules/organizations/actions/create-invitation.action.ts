"use server";

import { createOrganizationInvitation } from "../service/invitations.service";
import { isUserMemberOfOrganization } from "../service/organizations.service";

export type CreateInvitationActionResult = {
  success: boolean;
  error?: string;
  token?: string;
  expiresAt?: string;
};

export type CreateInvitationActionParams = {
  orgSlug: string;
  invitedEmail: string;
  roleId: string;
  invitationType?: "one_time" | "multi_use";
  isOwner?: boolean;
};

/**
 * Server action to create an organization invitation
 * Validates that the current user is a member of the organization
 */
export async function createInvitationAction(
  params: CreateInvitationActionParams
): Promise<CreateInvitationActionResult> {
  try {
    const isMember = await isUserMemberOfOrganization(params.orgSlug);
    if (!isMember) {
      return {
        success: false,
        error: "No autorizado: No eres miembro de esta organización",
      };
    }

    if (!params.invitedEmail?.trim()) {
      return {
        success: false,
        error: "El email del invitado es requerido",
      };
    }

    if (!params.roleId?.trim()) {
      return {
        success: false,
        error: "El rol es requerido",
      };
    }

    const result = await createOrganizationInvitation({
      orgSlug: params.orgSlug,
      invitedEmail: params.invitedEmail.trim(),
      roleId: params.roleId,
      invitationType: params.invitationType ?? "one_time",
      isOwner: params.isOwner ?? false,
    });

    return {
      success: true,
      token: result.token,
      expiresAt: result.expiresAt,
    };
  } catch (error) {
    console.error("Error creating invitation:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la invitación",
    };
  }
}
