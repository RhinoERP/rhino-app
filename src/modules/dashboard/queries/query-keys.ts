/**
 * Dashboard Query Keys
 * Factory functions para query keys consistentes
 */

import type { DateRange } from "../types";

export const dashboardQueryKeys = {
  all: (orgSlug: string) => ["org", orgSlug, "dashboard"] as const,
  data: (orgSlug: string, dateRange: DateRange) =>
    [...dashboardQueryKeys.all(orgSlug), "data", dateRange] as const,
};
