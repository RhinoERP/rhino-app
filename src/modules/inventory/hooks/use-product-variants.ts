"use client";

import { useQuery } from "@tanstack/react-query";
import { productVariantsClientQueryOptions } from "../queries/queries.client";
import type { ProductVariantWithStock } from "../types";

export function useProductVariants(
  orgSlug: string,
  productId: string,
  enabled?: boolean
) {
  return useQuery<ProductVariantWithStock[]>({
    ...productVariantsClientQueryOptions(orgSlug, productId),
    enabled: enabled !== false && !!productId,
  });
}
