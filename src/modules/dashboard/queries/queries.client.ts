/**
 * Dashboard Client Queries
 * TanStack Query configurations para cliente
 */

import { queryOptions } from "@tanstack/react-query";
import { getDashboardDataAction } from "../actions/get-dashboard-data.action";
import type { DashboardData, DateRange } from "../types";
import { dashboardQueryKeys } from "./query-keys";

export function dashboardDataQueryOptions(
  orgSlug: string,
  dateRange: DateRange
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.data(orgSlug, dateRange),
    queryFn: async (): Promise<DashboardData> => {
      const result = await getDashboardDataAction({
        orgSlug,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      if (!(result.success && result.data)) {
        throw new Error(result.error ?? "Error al obtener datos del dashboard");
      }

      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}
