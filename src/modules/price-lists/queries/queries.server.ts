import { getPriceListsByOrgSlug } from "../service/price-lists.service";
import { priceListsQueryKey } from "./query-keys";

export const priceListsServerQueryOptions = (orgSlug: string) => ({
  queryKey: priceListsQueryKey(orgSlug),
  queryFn: () => getPriceListsByOrgSlug(orgSlug),
});
