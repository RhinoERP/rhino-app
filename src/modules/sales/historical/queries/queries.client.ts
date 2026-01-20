import { queryOptions } from "@tanstack/react-query";
import type { HistoricalSalesMetric } from "../types";
import { historicalSalesQueryKeys } from "./query-keys";

export const historicalSalesClientQueryOptions = (
  orgSlug: string,
  startDate?: Date,
  endDate?: Date
) =>
  queryOptions({
    queryKey: historicalSalesQueryKeys.list(orgSlug, startDate, endDate),
    queryFn: async (): Promise<HistoricalSalesMetric[]> => {
      const params = new URLSearchParams();
      if (startDate) {
        params.append("startDate", startDate.toISOString().split("T")[0]);
      }
      if (endDate) {
        params.append("endDate", endDate.toISOString().split("T")[0]);
      }

      const url = `/api/org/${orgSlug}/historical-sales?${params.toString()}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error("Failed to fetch historical sales metrics");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
