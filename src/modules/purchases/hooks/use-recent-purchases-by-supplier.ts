"use client";

import { useQuery } from "@tanstack/react-query";
import { recentPurchasesBySupplierClientQueryOptions } from "../queries/queries.client";
import type { PurchaseOrderWithSupplier } from "../service/purchases.service";

export function useRecentPurchasesBySupplier(
  orgSlug: string,
  supplierId: string | null
) {
  return useQuery<PurchaseOrderWithSupplier[]>(
    recentPurchasesBySupplierClientQueryOptions(orgSlug, supplierId)
  );
}
