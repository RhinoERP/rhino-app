"use server";

import type { UpdateRouteSheetStatusInput } from "../service/route-sheets.service";
import { updateRouteSheetStatus } from "../service/route-sheets.service";

type UpdateRouteSheetStatusResult =
  | { success: true }
  | { success: false; error: string };

export async function updateRouteSheetStatusAction(
  input: UpdateRouteSheetStatusInput
): Promise<UpdateRouteSheetStatusResult> {
  try {
    await updateRouteSheetStatus(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar la hoja de ruta",
    };
  }
}
