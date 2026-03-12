"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePurchaseOrderAction } from "../actions/update-purchase-order.action";
import {
  purchaseOrderQueryKey,
  purchasesQueryKey,
} from "../queries/query-keys";
import type { UpdatePurchaseOrderInput } from "../service/purchases.service";

export function useUpdatePurchaseOrder(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePurchaseOrderInput) =>
      updatePurchaseOrderAction(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasesQueryKey(orgSlug) });
      queryClient.invalidateQueries({
        queryKey: purchaseOrderQueryKey(orgSlug, variables.purchaseOrderId),
      });
    },
  });
}
