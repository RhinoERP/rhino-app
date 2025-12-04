"use server";

import {
  getOrganizationBySlug,
  isUserMemberOfOrganization,
} from "../service/organizations.service";
import { updateRoleWithPermissions } from "../service/roles.service";

export type UpdateRoleActionResult = {
  success: boolean;
  error?: string;
};

export type UpdateRoleActionParams = {
  orgSlug: string;
  roleId: string;
  name: string;
  key: string;
  description?: string | null;
  permissionIds: string[];
};

/**
 * Server action to update a role for an organization
 * Validates that the current user is a member of the organization
 */
export async function updateRoleAction(
  params: UpdateRoleActionParams
): Promise<UpdateRoleActionResult> {
  try {
    // Verify that the user is a member of the organization
    const isMember = await isUserMemberOfOrganization(params.orgSlug);
    if (!isMember) {
      return {
        success: false,
        error: "No autorizado: No eres miembro de esta organización",
      };
    }

    // Get organization to validate it exists
    const organization = await getOrganizationBySlug(params.orgSlug);
    if (!organization) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    // Validate inputs
    if (!params.name?.trim()) {
      return {
        success: false,
        error: "El nombre del rol es requerido",
      };
    }

    if (!params.key?.trim()) {
      return {
        success: false,
        error: "La clave del rol es requerida",
      };
    }

    // Update the role
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
