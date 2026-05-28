"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { deactivateTaxById } from "@/modules/taxes/service/taxes.service";

export type DeleteTaxActionResult = {
  success: boolean;
  error?: string;
};

export type DeleteTaxActionParams = {
  orgSlug: string;
  taxId: string;
};

export async function deleteTaxAction(
  params: DeleteTaxActionParams
): Promise<DeleteTaxActionResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(params.orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    await deactivateTaxById(org.id, params.taxId);
    return {
      success: true,
    };
  } catch (error) {
    // Error deleting tax
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al eliminar el impuesto",
    };
  }
}
