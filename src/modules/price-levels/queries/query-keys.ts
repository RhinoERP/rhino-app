export const priceLevelsQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "price-levels"] as const;
