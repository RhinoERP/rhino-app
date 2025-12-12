export const priceListsQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "price-lists"] as const;
