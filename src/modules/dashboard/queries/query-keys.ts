/**
 * Dashboard Query Keys - Torre de Control
 */

import type { DashboardFilters } from "@/types/dashboard";

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
};
