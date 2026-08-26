"use server";

import { requireAuth } from "@/lib/supabase/auth";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
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
      customerId: values.customerId,
      currency: values.currency,
      exchangeRate: values.exchangeRate ?? null,
      paymentCondition: values.paymentCondition ?? null,
      observations: values.notes ?? null,
      advancePaymentEnabled: values.advancePaymentEnabled ?? false,
      advancePaymentPercentage: values.advancePaymentEnabled
        ? (values.advancePaymentPercentage ?? null)
        : null,
      targetMarginListId:
        values.targetMarginListId && values.targetMarginListId !== "none"
          ? values.targetMarginListId
          : null,
      globalDiscountPercentage: values.globalDiscountPercentage ?? null,
      invoiceType: values.invoiceType ?? "NOTA_DE_VENTA",
      taxes: values.taxes,
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
        discountPercentage: item.discountPercentage ?? null,
        taxes: item.taxes,
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
