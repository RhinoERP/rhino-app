"use server";

import { createOrganizationInvitation } from "@/modules/organizations/service/invitations.service";

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
