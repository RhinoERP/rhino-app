"use server";

import { updateRoleWithPermissions } from "@/modules/organizations/service/roles.service";

export type UpdateRoleActionResult = {
  success: boolean;
  error?: string;
};

export type UpdateRoleActionParams = {
  roleId: string;
  name: string;
  key: string;
  description?: string | null;
  permissionIds: string[];
};

/**
 * Server action to update a role
 */
export async function updateRoleAction(
  params: UpdateRoleActionParams
): Promise<UpdateRoleActionResult> {
  try {
    await updateRoleWithPermissions({
      roleId: params.roleId,
      name: params.name.trim(),
      key: params.key.trim(),
      description: params.description?.trim() || null,
      permissionIds: params.permissionIds,
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating role:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el rol",
    };
  }
}
