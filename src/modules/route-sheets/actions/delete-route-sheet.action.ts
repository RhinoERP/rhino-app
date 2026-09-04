"use server";

import { z } from "zod";
import type { DeleteRouteSheetInput } from "../service/route-sheets.service";
import { deleteRouteSheet } from "../service/route-sheets.service";

const deleteRouteSheetSchema = z.object({
  orgSlug: z.string().trim().min(1, "La organización es requerida"),
  routeSheetId: z.string().trim().min(1, "La hoja de ruta es requerida"),
});

type DeleteRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteRouteSheetAction(
  input: DeleteRouteSheetInput
): Promise<DeleteRouteSheetResult> {
  try {
    const validated = deleteRouteSheetSchema.parse(input);
    await deleteRouteSheet(validated);
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
          : "Error al eliminar la hoja de ruta",
    };
  }
}
