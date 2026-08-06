"use server";

import type { CreateRouteSheetInput } from "../service/route-sheets.service";
import { createRouteSheet } from "../service/route-sheets.service";

type CreateRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function createRouteSheetAction(
  input: CreateRouteSheetInput
): Promise<CreateRouteSheetResult> {
  try {
    await createRouteSheet(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al crear la hoja de ruta",
    };
  }
}
