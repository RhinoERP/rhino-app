export const productVariantsQueryKey = (orgSlug: string, productId: string) =>
  ["org", orgSlug, "stock", productId, "variants"] as const;
