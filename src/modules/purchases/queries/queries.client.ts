import type {
  ProductWithPrice,
  PurchaseOrderWithSupplier,
} from "../service/purchases.service";
import { productsBySupplierQueryKey, purchasesQueryKey } from "./query-keys";

export const purchasesClientQueryOptions = (orgSlug: string) => ({
  queryKey: purchasesQueryKey(orgSlug),
  queryFn: async (): Promise<PurchaseOrderWithSupplier[]> => {
    const res = await fetch(`/api/org/${orgSlug}/compras`);
    if (!res.ok) {
      throw new Error("Failed to fetch purchases");
    }
    return res.json();
  },
});

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
