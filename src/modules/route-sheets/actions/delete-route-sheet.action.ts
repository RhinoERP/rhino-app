"use server";

import type { DeleteRouteSheetInput } from "../service/route-sheets.service";
import { deleteRouteSheet } from "../service/route-sheets.service";

type DeleteRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteRouteSheetAction(
  input: DeleteRouteSheetInput
): Promise<DeleteRouteSheetResult> {
  try {
    await deleteRouteSheet(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al eliminar la hoja de ruta",
    };
  }
}
