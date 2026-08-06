"use server";

import { deleteRole } from "@/modules/organizations/service/roles.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

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
 */
export async function deleteRoleAction(
  params: DeleteRoleActionParams
): Promise<DeleteRoleActionResult> {
  await ensure("organization.admin", params.orgSlug);
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
