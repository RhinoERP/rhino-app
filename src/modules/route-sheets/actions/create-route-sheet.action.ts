"use server";

import { z } from "zod";
import type { CreateRouteSheetInput } from "../service/route-sheets.service";
import { createRouteSheet } from "../service/route-sheets.service";

const createRouteSheetSchema = z.object({
  orgSlug: z.string().trim().min(1, "La organización es requerida"),
  carrierId: z.string().trim().min(1, "El transporte es requerido"),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha es inválida"),
  notes: z.string().max(500).optional().nullable(),
});

type CreateRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function createRouteSheetAction(
  input: CreateRouteSheetInput
): Promise<CreateRouteSheetResult> {
  try {
    const validated = createRouteSheetSchema.parse(input);
    await createRouteSheet(validated);
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
          : "Error al crear la hoja de ruta",
    };
  }
}
