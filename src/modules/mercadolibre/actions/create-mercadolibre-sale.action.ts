"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MeliConfirmationError } from "../errors";
import { tryMeliFiscalAutomaticPublication } from "../service/meli-fiscal-automatic.service";
import { tryAutomaticMeliInvoice } from "../service/meli-invoice.service";
import { getMeliSale } from "../service/meli-read.service";
import { createMercadoLibreSale } from "../service/mercadolibre-sales.service";
import type { CreateMeliSaleInput } from "../types";

export async function createMercadoLibreSaleAction(input: CreateMeliSaleInput) {
  try {
    const sale = await createMercadoLibreSale(input);
    const fiscalWarning = await tryAutomaticMeliInvoice(
      input.orgSlug,
      sale.saleId
    );
    let accountingWarning: string | null = null;
    if (!fiscalWarning) {
      try {
        const currentSale = await getMeliSale(input.orgSlug, sale.saleId);
        if (!currentSale) {
          throw new Error("No se encontró la venta registrada.");
        }
        if (currentSale?.arca_status === "authorized") {
          accountingWarning = await tryMeliFiscalAutomaticPublication(
            input.orgSlug,
            { type: "invoice", saleId: sale.saleId }
          );
        }
      } catch (error) {
        console.error(
          "No se pudo verificar el estado fiscal de la venta",
          error
        );
        accountingWarning =
          "No se pudo verificar el estado fiscal para la contabilización; revisá la venta.";
      }
    }
    revalidatePath(`/org/${input.orgSlug}/venta-directa`);
    revalidatePath(`/org/${input.orgSlug}/venta-directa/mercado-libre`);
    revalidatePath(`/org/${input.orgSlug}/stock`);
    return {
      success: true as const,
      data: sale,
      fiscalWarning,
      accountingWarning,
    };
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
