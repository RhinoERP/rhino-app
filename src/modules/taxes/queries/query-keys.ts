export const taxesQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "taxes"] as const;
