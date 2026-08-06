import { getRouteSheetPageData } from "../service/route-sheets.service";
import { routeSheetsQueryKey } from "./query-keys";

export const routeSheetsServerQueryOptions = (orgSlug: string) => ({
  queryKey: routeSheetsQueryKey(orgSlug),
  queryFn: () => getRouteSheetPageData(orgSlug),
});
