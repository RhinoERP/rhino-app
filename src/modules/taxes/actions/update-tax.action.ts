"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { UpdateTaxInput } from "@/modules/taxes/service/taxes.service";
import { updateTaxById } from "@/modules/taxes/service/taxes.service";
import type { Tax } from "@/modules/taxes/types";

export type UpdateTaxActionResult = {
  success: boolean;
  error?: string;
  tax?: Tax;
};

export type UpdateTaxActionParams = {
  orgSlug: string;
  taxId: string;
} & UpdateTaxInput;

export async function updateTaxAction(
  params: UpdateTaxActionParams
): Promise<UpdateTaxActionResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(params.orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const tax = await updateTaxById(org.id, params.taxId, {
      name: params.name,
      rate: params.rate,
      code: params.code,
      description: params.description,
      is_favorite_sales: params.is_favorite_sales,
      is_favorite_direct_sales: params.is_favorite_direct_sales,
    });

    return {
      success: true,
      tax,
    };
  } catch (error) {
    // Error updating tax
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el impuesto",
    };
  }
}
