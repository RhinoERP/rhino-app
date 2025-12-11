"use server";

import { updateMemberRole } from "../service/members.service";
import { getOrganizationBySlug } from "../service/organizations.service";

export type UpdateMemberRoleActionResult = {
  success: boolean;
  error?: string;
};

export type UpdateMemberRoleActionParams = {
  userId: string;
  orgSlug: string;
  roleId: string | null;
};

export async function updateMemberRoleAction(
  params: UpdateMemberRoleActionParams
): Promise<UpdateMemberRoleActionResult> {
  try {
    const organization = await getOrganizationBySlug(params.orgSlug);

    if (!organization) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    await updateMemberRole({
      userId: params.userId,
      organizationId: organization.id,
      roleId: params.roleId,
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating member role:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el rol del miembro",
    };
  }
}
