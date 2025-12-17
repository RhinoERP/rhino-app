export const purchasesQueryKey = (orgSlug: string) => ["purchases", orgSlug];

export const productsBySupplierQueryKey = (
  orgSlug: string,
  supplierId: string
) => ["products", "by-supplier", orgSlug, supplierId];
