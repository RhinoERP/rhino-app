"use client";

import { queryOptions } from "@tanstack/react-query";
import type { CustomerProfitabilityDashboardResponse } from "@/types/dashboard";
import { dashboardKeys } from "./query-keys";

export function customerProfitabilityClientQueryOptions(
  orgSlug: string,
  startDate: Date,
  endDate: Date
) {
  return queryOptions({
    queryKey: dashboardKeys.customerProfitability(
      orgSlug,
      startDate.toISOString(),
      endDate.toISOString()
    ),
    queryFn: async (): Promise<CustomerProfitabilityDashboardResponse> => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      const response = await fetch(
        `/api/org/${orgSlug}/torre-de-control/customer-profitability?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `Failed to fetch customer profitability: ${response.status}`
        );
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
