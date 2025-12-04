"use server";

import {
  cancelInvitation,
  getActiveInvitationsBySlug,
} from "../service/invitations.service";

export type GetInvitationsActionResult = {
  success: boolean;
  error?: string;
  invitations?: Array<{
    id: string;
    invited_email: string;
    role?: {
      id: string;
      name: string;
      key: string;
    };
    is_owner: boolean;
    invitation_type: "one_time" | "multi_use";
    created_at: string;
    expires_at: string;
    invited_by?: {
      id: string;
      email: string | null;
      name: string | null;
    };
  }>;
};

/**
 * Server action to get active invitations for an organization
 */
export async function getInvitationsAction(
  orgSlug: string
): Promise<GetInvitationsActionResult> {
  try {
    const invitations = await getActiveInvitationsBySlug(orgSlug);

    return {
      success: true,
      invitations: invitations.map((inv) => ({
        id: inv.id,
        invited_email: inv.invited_email,
        role: inv.role,
        is_owner: inv.is_owner,
        invitation_type: inv.invitation_type,
        created_at: inv.created_at,
        expires_at: inv.expires_at,
        invited_by: inv.invited_by,
      })),
    };
  } catch (error) {
    console.error("Error getting invitations:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al obtener invitaciones",
    };
  }
}

export type CancelInvitationActionResult = {
  success: boolean;
  error?: string;
};

/**
 * Server action to cancel an invitation
 */
export async function cancelInvitationAction(
  invitationId: string,
  orgSlug: string
): Promise<CancelInvitationActionResult> {
  try {
    await cancelInvitation(invitationId, orgSlug);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error canceling invitation:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al cancelar la invitación",
    };
  }
}
