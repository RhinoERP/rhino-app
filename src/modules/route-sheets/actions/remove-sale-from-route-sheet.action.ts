"use server";

import type { RemoveSaleFromRouteSheetInput } from "../service/route-sheets.service";
import { removeSaleFromRouteSheet } from "../service/route-sheets.service";

type RemoveSaleFromRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function removeSaleFromRouteSheetAction(
  input: RemoveSaleFromRouteSheetInput
): Promise<RemoveSaleFromRouteSheetResult> {
  try {
    await removeSaleFromRouteSheet(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al quitar la venta de la hoja de ruta",
    };
  }
}
