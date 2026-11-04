"use client";

import { useQuery } from "@tanstack/react-query";
import { stockMovementsByVariantClientQueryOptions } from "../queries/queries.client";
import type { StockMovementWithLot } from "../types";

export function useStockMovementsByVariant(
  orgSlug: string,
  productId: string,
  variantId: string | null,
  enabled?: boolean
) {
  return useQuery<StockMovementWithLot[]>({
    ...stockMovementsByVariantClientQueryOptions(
      orgSlug,
      productId,
      variantId ?? ""
    ),
    enabled: enabled !== false && !!variantId,
  });
}
