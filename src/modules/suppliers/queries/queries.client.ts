import type { Supplier } from "../service/suppliers.service";
import { suppliersQueryKey } from "./query-keys";

export const suppliersClientQueryOptions = (orgSlug: string) => ({
  queryKey: suppliersQueryKey(orgSlug),
  queryFn: async (): Promise<Supplier[]> => {
    const res = await fetch(`/api/org/${orgSlug}/proveedores`);
    if (!res.ok) {
      throw new Error("Failed to fetch suppliers");
    }
    return res.json();
  },
});
