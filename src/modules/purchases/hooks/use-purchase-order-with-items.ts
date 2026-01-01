"use client";

import { useQuery } from "@tanstack/react-query";
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
      items: (PurchaseOrderItem & { product_name?: string })[];
    }
  >({
    queryKey: ["purchase-order", orgSlug, purchaseOrderId],
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
