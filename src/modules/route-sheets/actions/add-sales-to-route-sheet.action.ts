"use server";

import { z } from "zod";
import type { AddSalesToRouteSheetInput } from "../service/route-sheets.service";
import { addSalesToRouteSheet } from "../service/route-sheets.service";

const addSalesToRouteSheetSchema = z
  .object({
    orgSlug: z.string().trim().min(1, "La organización es requerida"),
    routeSheetId: z.string().trim().min(1, "La hoja de ruta es requerida"),
    saleIds: z.array(z.string().min(1)).min(1, "Seleccioná al menos una venta"),
    remittances: z
      .record(
        z.string().min(1),
        z
          .string()
          .min(1, "El número de remito es requerido")
          .max(50, "El número de remito es demasiado largo")
      )
      .default({}),
  })
  .superRefine((data, ctx) => {
    const selectedIds = new Set(data.saleIds);
    for (const key of Object.keys(data.remittances)) {
      if (!selectedIds.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "La venta del remito no está en la selección",
          path: ["remittances"],
        });
        break;
      }
    }
  });

type AddSalesToRouteSheetResult =
  | { success: true }
  | { success: false; error: string };

export async function addSalesToRouteSheetAction(
  input: AddSalesToRouteSheetInput
): Promise<AddSalesToRouteSheetResult> {
  try {
    const validated = addSalesToRouteSheetSchema.parse(input);
    await addSalesToRouteSheet(validated);
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
          : "Error al agregar las ventas a la hoja de ruta",
    };
  }
}
