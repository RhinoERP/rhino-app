"use server";

import { deleteRole } from "@/modules/organizations/service/roles.service";

export type DeleteRoleActionResult = {
  success: boolean;
  error?: string;
};

export type DeleteRoleActionParams = {
  roleId: string;
};

/**
 * Server action to delete a role from an organization
 */
export async function deleteRoleAction(
  params: DeleteRoleActionParams
): Promise<DeleteRoleActionResult> {
  try {
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
