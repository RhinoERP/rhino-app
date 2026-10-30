export const productVariantsQueryKey = (orgSlug: string, productId: string) =>
  ["org", orgSlug, "stock", productId, "variants"] as const;

export const stockMovementsByVariantQueryKey = (
  orgSlug: string,
  productId: string,
  variantId: string
) => ["org", orgSlug, "stock", productId, "movements", variantId] as const;
