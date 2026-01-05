"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePurchaseOrderAction } from "../actions/update-purchase-order.action";
import { purchasesQueryKey } from "../queries/query-keys";
import type { UpdatePurchaseOrderInput } from "../service/purchases.service";

export function useUpdatePurchaseOrder(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePurchaseOrderInput) =>
      updatePurchaseOrderAction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasesQueryKey(orgSlug) });
      queryClient.invalidateQueries({
        queryKey: ["purchase-order", orgSlug],
      });
    },
  });
}
