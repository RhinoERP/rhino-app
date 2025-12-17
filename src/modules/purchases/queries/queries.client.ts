import type { ProductWithPrice } from "../service/purchases.service";
import { productsBySupplierQueryKey } from "./query-keys";

export const productsBySupplierClientQueryOptions = (
  orgSlug: string,
  supplierId: string | null
) => ({
  queryKey: productsBySupplierQueryKey(orgSlug, supplierId ?? ""),
  queryFn: async (): Promise<ProductWithPrice[]> => {
    if (!supplierId) {
      return [];
    }
    const res = await fetch(
      `/api/org/${orgSlug}/proveedores/${supplierId}/productos`
    );
    if (!res.ok) {
      throw new Error("Failed to fetch products");
    }
    return res.json();
  },
  enabled: !!supplierId,
});
