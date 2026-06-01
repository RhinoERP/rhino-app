import type { ProductVariantWithStock } from "../types";
import { productVariantsQueryKey } from "./query-keys";

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
