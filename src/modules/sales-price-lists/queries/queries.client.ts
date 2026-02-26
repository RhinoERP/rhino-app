import type { SalesPriceList } from "../types";
import { salesPriceListsQueryKey } from "./query-keys";

export const salesPriceListsClientQueryOptions = (orgSlug: string) => ({
  queryKey: salesPriceListsQueryKey(orgSlug),
  queryFn: async (): Promise<SalesPriceList[]> => {
    const res = await fetch(
      `/api/org/${orgSlug}/precios/listas-de-precios-venta`
    );
    if (!res.ok) {
      throw new Error("Failed to fetch sales price lists");
    }
    return res.json();
  },
});
