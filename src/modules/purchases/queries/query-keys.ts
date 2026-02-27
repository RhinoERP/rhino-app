export const purchasesQueryKey = (orgSlug: string) => ["purchases", orgSlug];

export const purchaseOrderQueryKey = (
  orgSlug: string,
  purchaseOrderId: string
) => ["purchase-order", orgSlug, purchaseOrderId];

export const productsBySupplierQueryKey = (
  orgSlug: string,
  supplierId: string
) => ["products", "by-supplier", orgSlug, supplierId];
