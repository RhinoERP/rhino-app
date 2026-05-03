"use server";

import { setTaxFavoriteById } from "@/modules/taxes/service/taxes.service";
import type { Tax, TaxFavoriteContext } from "@/modules/taxes/types";

export type ToggleTaxFavoriteActionResult = {
  success: boolean;
  error?: string;
  tax?: Tax;
};

export type ToggleTaxFavoriteActionParams = {
  taxId: string;
  context: TaxFavoriteContext;
  isFavorite: boolean;
};

export async function toggleTaxFavoriteAction(
  params: ToggleTaxFavoriteActionParams
): Promise<ToggleTaxFavoriteActionResult> {
  try {
    const tax = await setTaxFavoriteById(
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
