"use client";

import { useQuery } from "@tanstack/react-query";
import { purchaseOrderQueryKey } from "../queries/query-keys";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from "../service/purchases.service";

export function usePurchaseOrderWithItems(
  orgSlug: string,
  purchaseOrderId: string | null
) {
  return useQuery<
    PurchaseOrder & {
      items: (PurchaseOrderItem & {
        product_name?: string;
        unit_of_measure?: string | null;
        weight_per_unit?: number | null;
        has_variants?: boolean;
        variant_stocks?: Record<string, Record<string, number>> | null;
      })[];
    }
  >({
    queryKey: purchaseOrderId
      ? purchaseOrderQueryKey(orgSlug, purchaseOrderId)
      : ["purchase-order", orgSlug, null],
    queryFn: async () => {
      if (!purchaseOrderId) {
        throw new Error("Purchase order ID is required");
      }
      const res = await fetch(`/api/org/${orgSlug}/compras/${purchaseOrderId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch purchase order");
      }
      return res.json();
    },
    enabled: !!purchaseOrderId,
  });
}
