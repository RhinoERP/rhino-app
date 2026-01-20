export const historicalSalesQueryKeys = {
  all: (orgSlug: string) =>
    ["organizations", orgSlug, "historical-sales"] as const,
  list: (orgSlug: string, startDate?: Date, endDate?: Date) =>
    [
      ...historicalSalesQueryKeys.all(orgSlug),
      "list",
      { startDate, endDate },
    ] as const,
};
