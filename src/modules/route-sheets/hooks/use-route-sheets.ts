"use client";

import { useQuery } from "@tanstack/react-query";
import { routeSheetsClientQueryOptions } from "../queries/queries.client";
import type { RouteSheetPageData } from "../service/route-sheets.service";

export function useRouteSheets(orgSlug: string) {
  return useQuery<RouteSheetPageData>(routeSheetsClientQueryOptions(orgSlug));
}
