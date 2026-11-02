"use server";

import { requireAuth } from "@/lib/supabase/auth";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  mapQuoteFormItems,
  toNullablePricingId,
} from "@/modules/quotes/utils/quote-form-items";
import { createQuote } from "../service/quotes.service";
import type { CreateQuoteInput, QuoteFormValues } from "../types";

export type CreateQuoteActionResult = {
  success: boolean;
  quoteId?: string;
  error?: string;
};

export async function createQuoteAction(
  orgSlug: string,
  values: QuoteFormValues
): Promise<CreateQuoteActionResult> {
  await ensure("quotes.manage", orgSlug);
  try {
    await requireAuth();
    // Map QuoteFormValues to CreateQuoteInput
    const input: CreateQuoteInput = {
      orgSlug,
      warehouseId: values.warehouseId,
      customerId: values.customerId,
      currency: values.currency,
      exchangeRate: values.exchangeRate ?? null,
      paymentCondition: values.paymentCondition ?? null,
      observations: values.notes ?? null,
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

    // Call service to create quote
    const quoteId = await createQuote(input);

    return {
      success: true,
      quoteId,
    };
  } catch (error) {
    console.error("Error creating quote:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error desconocido al crear el presupuesto";

    return {
      success: false,
      error: errorMessage,
    };
  }
}
