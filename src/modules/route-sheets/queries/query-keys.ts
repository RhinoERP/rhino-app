export const routeSheetsQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "route-sheets"] as const;

export type CompletedRouteSheetsFilters = {
  dateFrom?: string;
  dateTo?: string;
  carrierId?: string;
  saleNumber?: string;
};

export const completedRouteSheetsQueryKey = (
  orgSlug: string,
  filters: CompletedRouteSheetsFilters
) => [...routeSheetsQueryKey(orgSlug), "completed", filters] as const;
