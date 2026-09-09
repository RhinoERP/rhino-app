import type {
  RouteSheetPageData,
  RouteSheetWithSales,
} from "../service/route-sheets.service";
import {
  type CompletedRouteSheetsFilters,
  completedRouteSheetsQueryKey,
  routeSheetsQueryKey,
} from "./query-keys";

export const routeSheetsClientQueryOptions = (orgSlug: string) => ({
  queryKey: routeSheetsQueryKey(orgSlug),
  queryFn: async (): Promise<RouteSheetPageData> => {
    const res = await fetch(`/api/org/${orgSlug}/route-sheets`);
    if (!res.ok) {
      throw new Error("No se pudieron cargar las hojas de ruta");
    }
    return res.json();
  },
});

const toQueryString = (filters: CompletedRouteSheetsFilters) => {
  const params = new URLSearchParams();
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  if (filters.carrierId) {
    params.set("carrierId", filters.carrierId);
  }
  if (filters.saleNumber) {
    params.set("saleNumber", filters.saleNumber);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export const completedRouteSheetsClientQueryOptions = (
  orgSlug: string,
  filters: CompletedRouteSheetsFilters
) => ({
  queryKey: completedRouteSheetsQueryKey(orgSlug, filters),
  queryFn: async (): Promise<{ routeSheets: RouteSheetWithSales[] }> => {
    const res = await fetch(
      `/api/org/${orgSlug}/route-sheets/completed${toQueryString(filters)}`
    );
    if (!res.ok) {
      throw new Error("No se pudieron cargar las hojas completadas");
    }
    return res.json();
  },
});
