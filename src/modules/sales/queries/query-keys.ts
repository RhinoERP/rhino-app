export const salesQueryKey = (orgSlug: string) => ["sales", orgSlug];
export const preSalesQueryKey = (orgSlug: string) => ["pre-sales", orgSlug];
export const directSalesQueryKey = (orgSlug: string) =>
  ["direct-sales", orgSlug] as const;
export const directSaleTerminalsQueryKey = (orgSlug: string) =>
  ["direct-sale-terminals", orgSlug] as const;
export const directSaleDefaultOpenTerminalQueryKey = (orgSlug: string) =>
  ["direct-sale-default-open-terminal", orgSlug] as const;
export const directSaleCustomersQueryKey = (orgSlug: string) =>
  ["direct-sale-customers", orgSlug] as const;
export const saleDispatchProgressKey = (orgSlug: string, saleId: string) =>
  ["sale-dispatch-progress", orgSlug, saleId] as const;

export const directSaleProductsQueryKey = (
  orgSlug: string,
  search: string,
  limit = 20
) =>
  [
    "direct-sale-products",
    orgSlug,
    search.trim().toLowerCase(),
    limit,
  ] as const;
