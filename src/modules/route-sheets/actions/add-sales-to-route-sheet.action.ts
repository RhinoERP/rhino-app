"use server";

import type { AddSalesToRouteSheetInput } from "../service/route-sheets.service";
import { addSalesToRouteSheet } from "../service/route-sheets.service";

type AddSalesToRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function addSalesToRouteSheetAction(
  input: AddSalesToRouteSheetInput
): Promise<AddSalesToRouteSheetResult> {
  try {
    await addSalesToRouteSheet(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al agregar las ventas a la hoja de ruta",
    };
  }
}
