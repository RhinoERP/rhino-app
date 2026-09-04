"use server";

import { z } from "zod";
import type { RemoveSaleFromRouteSheetInput } from "../service/route-sheets.service";
import { removeSaleFromRouteSheet } from "../service/route-sheets.service";

const removeSaleFromRouteSheetSchema = z.object({
  orgSlug: z.string().trim().min(1, "La organización es requerida"),
  routeSheetId: z.string().trim().min(1, "La hoja de ruta es requerida"),
  saleId: z.string().trim().min(1, "La venta es requerida"),
});

type RemoveSaleFromRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function removeSaleFromRouteSheetAction(
  input: RemoveSaleFromRouteSheetInput
): Promise<RemoveSaleFromRouteSheetResult> {
  try {
    const validated = removeSaleFromRouteSheetSchema.parse(input);
    await removeSaleFromRouteSheet(validated);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al quitar la venta de la hoja de ruta",
    };
  }
}
