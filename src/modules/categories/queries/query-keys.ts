export const categoriesQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "categories"] as const;
