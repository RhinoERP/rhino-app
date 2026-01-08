import { getSalesPriceListsByOrgSlug } from "../service/sales-price-lists.service";
import { salesPriceListsQueryKey } from "./query-keys";

export const salesPriceListsServerQueryOptions = (orgSlug: string) => ({
  queryKey: salesPriceListsQueryKey(orgSlug),
  queryFn: () => getSalesPriceListsByOrgSlug(orgSlug),
});
