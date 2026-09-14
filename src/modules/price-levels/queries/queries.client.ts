import type { PriceLevelWithStatus } from "../types";
import { priceLevelsQueryKey } from "./query-keys";

export const priceLevelsClientQueryOptions = (orgSlug: string) => ({
  queryKey: priceLevelsQueryKey(orgSlug),
  queryFn: async (): Promise<PriceLevelWithStatus[]> => {
    const res = await fetch(
      `/api/org/${orgSlug}/precios/listas-de-precios-venta/niveles`
    );
    if (!res.ok) {
      throw new Error("Failed to fetch price levels");
    }
    return res.json();
  },
});
