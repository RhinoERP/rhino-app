"use client";

import { useQuery } from "@tanstack/react-query";
import { completedRouteSheetsClientQueryOptions } from "../queries/queries.client";
import type { CompletedRouteSheetsFilters } from "../queries/query-keys";

export function useCompletedRouteSheets(
  orgSlug: string,
  filters: CompletedRouteSheetsFilters,
  enabled = true
) {
  return useQuery({
    ...completedRouteSheetsClientQueryOptions(orgSlug, filters),
    enabled,
  });
}
