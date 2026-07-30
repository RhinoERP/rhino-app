"use server";

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
  try {
    // Map QuoteFormValues to CreateQuoteInput
    const input: CreateQuoteInput = {
      orgSlug,
      customerId: values.customerId,
      currency: values.currency,
      exchangeRate: values.exchangeRate ?? null,
      paymentCondition: values.paymentCondition ?? null,
      observations: values.notes ?? null,
      advancePaymentEnabled: values.advancePaymentEnabled ?? false,
      advancePaymentPercentage: values.advancePaymentEnabled
        ? (values.advancePaymentPercentage ?? null)
        : null,
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
