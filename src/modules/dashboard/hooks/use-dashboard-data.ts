"use client";

/**
 * Dashboard Hooks
 * React hooks personalizados para el dashboard
 */

import { useSuspenseQuery } from "@tanstack/react-query";
import { dashboardDataQueryOptions } from "../queries/queries.client";
import type { DateRange } from "../types";

export function useDashboardData(orgSlug: string, dateRange: DateRange) {
  return useSuspenseQuery(dashboardDataQueryOptions(orgSlug, dateRange));
}
