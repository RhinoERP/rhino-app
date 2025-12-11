export const customersQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "customers"] as const;
