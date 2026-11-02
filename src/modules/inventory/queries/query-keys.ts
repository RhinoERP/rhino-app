export const stockMetricsQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "stock-metrics"] as const;

export const scopedStockMetricsQueryKey = (
  orgSlug: string,
  accessKey: string,
  warehouseId?: string
) =>
  [...stockMetricsQueryKey(orgSlug), accessKey, warehouseId ?? "all"] as const;

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
