import type { ProductVariantWithStock, StockMovementWithLot } from "../types";
import {
  productVariantsQueryKey,
  stockMovementsByVariantQueryKey,
} from "./query-keys";

export const productVariantsClientQueryOptions = (
  orgSlug: string,
  productId: string
) => ({
  queryKey: productVariantsQueryKey(orgSlug, productId),
  queryFn: async (): Promise<ProductVariantWithStock[]> => {
    const res = await fetch(`/api/org/${orgSlug}/stock/${productId}/variants`);
    if (!res.ok) {
      throw new Error("Error al cargar variantes");
    }
    return res.json();
  },
});

export const stockMovementsByVariantClientQueryOptions = (
  orgSlug: string,
  productId: string,
  lotId: string
) => ({
  queryKey: stockMovementsByVariantQueryKey(orgSlug, productId, lotId),
  queryFn: async (): Promise<StockMovementWithLot[]> => {
    const res = await fetch(
      `/api/org/${orgSlug}/stock/${productId}/movements?lotId=${encodeURIComponent(lotId)}`
    );
    if (!res.ok) {
      throw new Error("Error al cargar movimientos");
    }
    return res.json();
  },
});
