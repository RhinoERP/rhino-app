"use server";

import {
  getOrganizationBySlug,
  isUserMemberOfOrganization,
} from "../service/organizations.service";
import { createRoleWithPermissions } from "../service/roles.service";

export type CreateRoleActionResult = {
  success: boolean;
  error?: string;
  roleId?: string;
};

export type CreateRoleActionParams = {
  orgSlug: string;
  name: string;
  key: string;
  description?: string | null;
  permissionIds: string[];
};

/**
 * Server action to create a role for an organization
 * Validates that the current user is a member of the organization
 */
export async function createRoleAction(
  params: CreateRoleActionParams
): Promise<CreateRoleActionResult> {
  try {
    // Verify that the user is a member of the organization
    const isMember = await isUserMemberOfOrganization(params.orgSlug);
    if (!isMember) {
      return {
        success: false,
        error: "No autorizado: No eres miembro de esta organización",
      };
    }

    // Get organization to get the organization_id
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

    // Create the role
    const result = await createRoleWithPermissions({
      organizationId: organization.id,
      name: params.name.trim(),
      key: params.key.trim(),
      description: params.description?.trim() || null,
      permissionIds: params.permissionIds,
    });

    return {
      success: true,
      roleId: result.id,
    };
  } catch (error) {
    console.error("Error creating role:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear el rol",
    };
  }
}
