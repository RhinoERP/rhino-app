"use server";

import type { Tax } from "../service/taxes.service";
import { setTaxFavoriteById } from "../service/taxes.service";

export type ToggleTaxFavoriteActionResult = {
  success: boolean;
  error?: string;
  tax?: Tax;
};

export type ToggleTaxFavoriteActionParams = {
  taxId: string;
  isFavorite: boolean;
};

export async function toggleTaxFavoriteAction(
  params: ToggleTaxFavoriteActionParams
): Promise<ToggleTaxFavoriteActionResult> {
  try {
    const tax = await setTaxFavoriteById(params.taxId, params.isFavorite);
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
