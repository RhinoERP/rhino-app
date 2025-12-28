import type { SalesOrderWithCustomer } from "../service/sales.service";
import { salesQueryKey } from "./query-keys";

export const salesClientQueryOptions = (orgSlug: string) => ({
  queryKey: salesQueryKey(orgSlug),
  queryFn: async (): Promise<SalesOrderWithCustomer[]> => {
    const res = await fetch(`/api/org/${orgSlug}/ventas`);
    if (!res.ok) {
      throw new Error("Error al obtener ventas");
    }
    return res.json();
  },
});
