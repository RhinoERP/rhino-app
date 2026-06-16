"use server";

import { revalidatePath } from "next/cache";
import { updateQuote } from "../service/quotes.service";
import type { QuoteFormValues } from "../types";

export type UpdateQuoteActionResult = {
  success: boolean;
  error?: string;
};

export async function updateQuoteAction(
  orgSlug: string,
  quoteId: string,
  values: QuoteFormValues
): Promise<UpdateQuoteActionResult> {
  try {
    const input = {
      orgSlug,
      customerId: values.customerId,
      currency: values.currency,
      observations: values.notes ?? null,
      purchaseOrderFile: values.purchaseOrderFile ?? null,
      items: values.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        variants: item.variants.map((v) => ({
          talle: v.talle,
          color: v.color,
          quantity: v.quantity,
          productVariantId: v.productVariantId,
        })),
        discountPercentage: null,
        discountAmount: null,
        extras: item.extras,
      })),
    };

    await updateQuote(quoteId, input);

    revalidatePath(`/org/${orgSlug}/listas-de-presupuestos`);
    revalidatePath(`/org/${orgSlug}/presupuestos/${quoteId}/editar`);

    return { success: true };
  } catch (error) {
    console.error("Error updating quote:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error desconocido al actualizar el presupuesto";

    return {
      success: false,
      error: errorMessage,
    };
  }
}
