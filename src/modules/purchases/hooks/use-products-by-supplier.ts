"use client";

import { useQuery } from "@tanstack/react-query";
import { productsBySupplierClientQueryOptions } from "../queries/queries.client";
import type { ProductWithPrice } from "../service/purchases.service";

export function useProductsBySupplier(
  orgSlug: string,
  supplierId: string | null
) {
  return useQuery<ProductWithPrice[]>(
    productsBySupplierClientQueryOptions(orgSlug, supplierId)
  );
}
