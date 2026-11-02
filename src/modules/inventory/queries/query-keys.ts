export const productVariantsQueryKey = (
  orgSlug: string,
  productId: string,
  warehouseId?: string
) =>
  [
    "org",
    orgSlug,
    "stock",
    productId,
    "variants",
    warehouseId ?? "all",
  ] as const;

export const stockMovementsByVariantQueryKey = (
  orgSlug: string,
  productId: string,
  variantId: string
) => ["org", orgSlug, "stock", productId, "movements", variantId] as const;
