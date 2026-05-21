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
      paymentCondition: values.notes ? null : null,
      observations: values.notes ?? null,
      items: values.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        variants: item.variants.map((v) => ({
          size: v.size,
          quantity: v.quantity,
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
