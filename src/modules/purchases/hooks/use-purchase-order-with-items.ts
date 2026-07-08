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
        category_id?: string | null;
        accountingAccountCode?: string | null;
        product_name?: string;
        unit_of_measure?: string | null;
        weight_per_unit?: number | null;
        has_variants?: boolean;
      })[];
      taxes: Array<{
        tax_id: string;
        name: string;
        rate: number;
        tax_amount: number;
      }> | null;
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
