import type { RouteSheetPageData } from "../service/route-sheets.service";
import { routeSheetsQueryKey } from "./query-keys";

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
