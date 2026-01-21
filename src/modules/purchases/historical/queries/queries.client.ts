import { queryOptions } from "@tanstack/react-query";
import type { HistoricalPurchaseMetric } from "../types";
import { historicalPurchasesQueryKeys } from "./query-keys";

export const historicalPurchasesClientQueryOptions = (
  orgSlug: string,
  startDate?: Date,
  endDate?: Date
) =>
  queryOptions({
    queryKey: historicalPurchasesQueryKeys.list(orgSlug, startDate, endDate),
    queryFn: async (): Promise<HistoricalPurchaseMetric[]> => {
      const params = new URLSearchParams();
      if (startDate) {
        params.append("startDate", startDate.toISOString().split("T")[0]);
      }
      if (endDate) {
        params.append("endDate", endDate.toISOString().split("T")[0]);
      }

      const url = `/api/org/${orgSlug}/historical-purchases?${params.toString()}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error("Failed to fetch historical purchase metrics");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
