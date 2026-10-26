"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  mapQuoteFormItems,
  toNullablePricingId,
} from "@/modules/quotes/utils/quote-form-items";
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
  await ensure("quotes.manage", orgSlug);
  try {
    const input = {
      orgSlug,
      customerId: values.customerId,
      currency: values.currency,
      exchangeRate: values.exchangeRate ?? null,
      paymentCondition: values.paymentCondition ?? null,
      observations: values.notes ?? null,
      purchaseOrderFile: values.purchaseOrderFile ?? null,
      designFileUrl: values.designFile ?? null,
      advancePaymentEnabled: values.advancePaymentEnabled ?? false,
      advancePaymentPercentage: values.advancePaymentEnabled
        ? (values.advancePaymentPercentage ?? null)
        : null,
      priceLevelId: toNullablePricingId(values.priceLevelId),
      salesPriceListId: toNullablePricingId(values.salesPriceListId),
      globalDiscountPercentage: values.globalDiscountPercentage ?? null,
      invoiceType: values.invoiceType ?? "NOTA_DE_VENTA",
      taxes: values.taxes,
      items: mapQuoteFormItems(values.items, values.currency),
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
