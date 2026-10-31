import { queryOptions } from "@tanstack/react-query";
import { getWarehouseAdministrationAction } from "../actions/warehouse-administration.actions";

export const warehouseAdministrationQueryKey = (orgSlug: string) =>
  ["warehouse-administration", orgSlug] as const;

export function warehouseAdministrationQueryOptions(orgSlug: string) {
  return queryOptions({
    queryKey: warehouseAdministrationQueryKey(orgSlug),
    queryFn: () => getWarehouseAdministrationAction(orgSlug),
    staleTime: 0,
  });
}
