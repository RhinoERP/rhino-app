import type { CreateQuoteItemInput, QuoteFormValues } from "../types";

export function toNullablePricingId(
  id: string | null | undefined
): string | null {
  return id && id !== "none" ? id : null;
}

/** Los precios de productos y extras del formulario ya están en la moneda del presupuesto. */
export function mapQuoteFormItems(
  items: QuoteFormValues["items"],
  currency: QuoteFormValues["currency"]
): CreateQuoteItemInput[] {
  return items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    currency,
    unitPrice: item.unitPrice,
    variants: item.variants.map((variant) => ({
      talle: variant.talle,
      color: variant.color,
      quantity: variant.quantity,
      productVariantId: variant.productVariantId,
      extras: variant.extras,
    })),
    discountPercentage: item.discountPercentage ?? null,
    taxes: item.taxes,
  }));
}
