import { useQuery } from "@tanstack/react-query";
import { historicalSalesClientQueryOptions } from "../queries/queries.client";

export function useHistoricalSales(
  orgSlug: string,
  startDate?: Date,
  endDate?: Date
) {
  return useQuery(
    historicalSalesClientQueryOptions(orgSlug, startDate, endDate)
  );
}
