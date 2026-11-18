"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MeliConfirmationError } from "../errors";
import { tryAutomaticMeliInvoice } from "../service/meli-invoice.service";
import { createMercadoLibreSale } from "../service/mercadolibre-sales.service";
import type { CreateMeliSaleInput } from "../types";

export async function createMercadoLibreSaleAction(input: CreateMeliSaleInput) {
  try {
    const sale = await createMercadoLibreSale(input);
    const fiscalWarning = await tryAutomaticMeliInvoice(
      input.orgSlug,
      sale.saleId
    );
    revalidatePath(`/org/${input.orgSlug}/venta-directa`);
    revalidatePath(`/org/${input.orgSlug}/venta-directa/mercado-libre`);
    revalidatePath(`/org/${input.orgSlug}/stock`);
    return { success: true as const, data: sale, fiscalWarning };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false as const,
        error: error.issues[0]?.message ?? "Datos inválidos.",
        canEdit: true,
      };
    }
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo registrar la venta Meli.",
      canEdit: error instanceof MeliConfirmationError && error.canEdit,
    };
  }
}
