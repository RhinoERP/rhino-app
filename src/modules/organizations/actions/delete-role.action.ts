"use server";

import { isUserMemberOfOrganization } from "../service/organizations.service";
import { deleteRole } from "../service/roles.service";

export type DeleteRoleActionResult = {
  success: boolean;
  error?: string;
};

export type DeleteRoleActionParams = {
  orgSlug: string;
  roleId: string;
};

/**
 * Server action to delete a role from an organization
 * Validates that the current user is a member of the organization
 */
export async function deleteRoleAction(
  params: DeleteRoleActionParams
): Promise<DeleteRoleActionResult> {
  try {
    // Verify that the user is a member of the organization
    const isMember = await isUserMemberOfOrganization(params.orgSlug);
    if (!isMember) {
      return {
        success: false,
        error: "No autorizado: No eres miembro de esta organización",
      };
    }

    // Delete the role
    await deleteRole(params.roleId);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting role:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar el rol",
    };
  }
}
