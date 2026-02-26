"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePurchaseStatusAction } from "../actions/update-purchase-status.action";
import {
  purchaseOrderQueryKey,
  purchasesQueryKey,
} from "../queries/query-keys";

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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: purchasesQueryKey(orgSlug) });
      queryClient.invalidateQueries({
        queryKey: purchaseOrderQueryKey(orgSlug, variables.purchaseOrderId),
      });
    },
  });
}
