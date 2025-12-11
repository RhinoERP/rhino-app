export const suppliersQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "suppliers"] as const;
