import type { PriceList } from "../types";
import { priceListsQueryKey } from "./query-keys";

export const priceListsClientQueryOptions = (orgSlug: string) => ({
  queryKey: priceListsQueryKey(orgSlug),
  queryFn: async (): Promise<PriceList[]> => {
    const res = await fetch(`/api/org/${orgSlug}/precios/listas-de-precios`);
    if (!res.ok) {
      throw new Error("Failed to fetch price lists");
    }
    return res.json();
  },
});
