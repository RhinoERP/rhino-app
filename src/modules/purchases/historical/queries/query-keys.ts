export const historicalPurchasesQueryKeys = {
  all: ["historical-purchases"] as const,
  lists: () => [...historicalPurchasesQueryKeys.all, "list"] as const,
  list: (orgSlug: string, startDate?: Date, endDate?: Date) =>
    [
      ...historicalPurchasesQueryKeys.lists(),
      orgSlug,
      startDate?.toISOString(),
      endDate?.toISOString(),
    ] as const,
};
