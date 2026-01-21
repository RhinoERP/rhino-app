import { useQuery } from "@tanstack/react-query";
import { historicalPurchasesClientQueryOptions } from "../queries/queries.client";

export function useHistoricalPurchases(
  orgSlug: string,
  startDate?: Date,
  endDate?: Date
) {
  return useQuery(
    historicalPurchasesClientQueryOptions(orgSlug, startDate, endDate)
  );
}
