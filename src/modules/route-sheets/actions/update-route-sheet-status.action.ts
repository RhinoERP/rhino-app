"use server";

import { z } from "zod";
import type { UpdateRouteSheetStatusInput } from "../service/route-sheets.service";
import { updateRouteSheetStatus } from "../service/route-sheets.service";

const updateRouteSheetStatusSchema = z.object({
  orgSlug: z.string().trim().min(1, "La organización es requerida"),
  routeSheetId: z.string().trim().min(1, "La hoja de ruta es requerida"),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
});

type UpdateRouteSheetStatusResult =
  | { success: true }
  | { success: false; error: string };

export async function updateRouteSheetStatusAction(
  input: UpdateRouteSheetStatusInput
): Promise<UpdateRouteSheetStatusResult> {
  try {
    const validated = updateRouteSheetStatusSchema.parse(input);
    await updateRouteSheetStatus(validated);
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
          : "Error al actualizar la hoja de ruta",
    };
  }
}
