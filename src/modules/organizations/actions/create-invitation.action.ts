"use server";

import { sendInvitationEmail } from "@/modules/email/service/send-invitation-email";
import { createOrganizationInvitation } from "@/modules/organizations/service/invitations.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

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
 * Sends an invitation email using Resend
 */
export async function createInvitationAction(
  params: CreateInvitationActionParams
): Promise<CreateInvitationActionResult> {
  try {
    // Get organization info for email
    const organization = await getOrganizationBySlug(params.orgSlug);

    if (!organization) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    // Create the invitation
    const result = await createOrganizationInvitation({
      orgSlug: params.orgSlug,
      invitedEmail: params.invitedEmail.trim(),
      roleId: params.roleId,
      invitationType: params.invitationType ?? "one_time",
      isOwner: params.isOwner ?? false,
    });

    // Send invitation email
    try {
      await sendInvitationEmail({
        to: params.invitedEmail.trim(),
        organizationName: organization.name,
        invitationToken: result.token,
      });
    } catch (emailError) {
      // Log email error but don't fail the invitation creation
      // The invitation was already created successfully
      console.error("Error sending invitation email:", emailError);
      // You might want to return a warning here, but for now we'll continue
    }

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
