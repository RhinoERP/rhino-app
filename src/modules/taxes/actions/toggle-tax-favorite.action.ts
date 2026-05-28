"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { setTaxFavoriteById } from "@/modules/taxes/service/taxes.service";
import type { Tax, TaxFavoriteContext } from "@/modules/taxes/types";

export type ToggleTaxFavoriteActionResult = {
  success: boolean;
  error?: string;
  tax?: Tax;
};

export type ToggleTaxFavoriteActionParams = {
  orgSlug: string;
  taxId: string;
  context: TaxFavoriteContext;
  isFavorite: boolean;
};

export async function toggleTaxFavoriteAction(
  params: ToggleTaxFavoriteActionParams
): Promise<ToggleTaxFavoriteActionResult> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const org = await getOrganizationBySlug(params.orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    const tax = await setTaxFavoriteById(
      org.id,
      params.taxId,
      params.context,
      params.isFavorite
    );
    return {
      success: true,
      tax,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar favorito",
    };
  }
}
