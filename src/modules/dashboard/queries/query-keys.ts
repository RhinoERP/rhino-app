/**
 * Dashboard Query Keys - Torre de Control
 */

import type { DashboardFilters, ProfitabilityGroupBy } from "@/types/dashboard";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  org: (orgSlug: string) => [...dashboardKeys.all, orgSlug] as const,
  controlTower: (
    orgSlug: string,
    startDate: string,
    endDate: string,
    filters?: DashboardFilters
  ) =>
    [
      ...dashboardKeys.org(orgSlug),
      "control-tower",
      { startDate, endDate, filters },
    ] as const,
  financial: (
    orgSlug: string,
    startDate: string,
    endDate: string,
    filters?: DashboardFilters
  ) =>
    [
      ...dashboardKeys.org(orgSlug),
      "financial",
      { startDate, endDate, filters },
    ] as const,
  profitability: (
    orgSlug: string,
    startDate: string,
    endDate: string,
    groupBy: ProfitabilityGroupBy
  ) =>
    [
      ...dashboardKeys.org(orgSlug),
      "profitability",
      { startDate, endDate, groupBy },
    ] as const,
};
