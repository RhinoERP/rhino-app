"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { purchasesClientQueryOptions } from "../queries/queries.client";
import type { PurchaseOrderWithSupplier } from "../service/purchases.service";

export function usePurchases(orgSlug: string) {
  return useSuspenseQuery<PurchaseOrderWithSupplier[]>(
    purchasesClientQueryOptions(orgSlug)
  );
}
