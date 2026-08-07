"use server";

import { revalidatePath } from "next/cache";
import {
  type UpdateMemberCommissionParams,
  updateMemberCommission,
} from "../service/members.service";
import { getOrganizationBySlug } from "../service/organizations.service";
import { isOrganizationModuleEnabled } from "../utils/module-flags";

export async function updateMemberCommissionAction(
  orgSlug: string,
  params: UpdateMemberCommissionParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const org = await getOrganizationBySlug(orgSlug);

    if (!isOrganizationModuleEnabled(org, "commissions")) {
      return {
        success: false,
        error:
          "El módulo de comisiones no está habilitado para esta organización",
      };
    }

    await updateMemberCommission(params);
    revalidatePath(`/org/${orgSlug}/configuracion/miembros`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error actualizando comisión base",
    };
  }
}
