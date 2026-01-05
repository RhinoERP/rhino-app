"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePurchaseStatusAction } from "../actions/update-purchase-status.action";
import { purchasesQueryKey } from "../queries/query-keys";

export function useUpdatePurchaseStatus(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      purchaseOrderId,
      status,
      options,
    }: {
      purchaseOrderId: string;
      status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
      options?: {
        delivery_date?: string;
        logistics?: string;
      };
    }) => updatePurchaseStatusAction(orgSlug, purchaseOrderId, status, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchasesQueryKey(orgSlug) });
    },
  });
}
