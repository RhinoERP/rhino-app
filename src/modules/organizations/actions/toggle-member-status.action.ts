"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { toggleMemberStatus } from "../service/members.service";
import { getOrganizationBySlug } from "../service/organizations.service";

export type ToggleMemberStatusActionResult = {
  success: boolean;
  error?: string;
};

export type ToggleMemberStatusActionParams = {
  userId: string;
  orgSlug: string;
  isActive: boolean;
};

export async function toggleMemberStatusAction(
  params: ToggleMemberStatusActionParams
): Promise<ToggleMemberStatusActionResult> {
  await ensure("organization.admin", params.orgSlug);
  try {
    const organization = await getOrganizationBySlug(params.orgSlug);

    if (!organization) {
      return {
        success: false,
        error: "Organización no encontrada",
      };
    }

    await toggleMemberStatus({
      userId: params.userId,
      organizationId: organization.id,
      isActive: params.isActive,
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error toggling member status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al cambiar el estado del miembro",
    };
  }
}
