export const productVariantsQueryKey = (orgSlug: string, productId: string) =>
  ["org", orgSlug, "stock", productId, "variants"] as const;

export const stockMovementsByVariantQueryKey = (
  orgSlug: string,
  productId: string,
  lotId: string
) => ["org", orgSlug, "stock", productId, "movements", lotId] as const;
