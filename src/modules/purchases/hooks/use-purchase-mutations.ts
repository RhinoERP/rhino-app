"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPurchaseAction } from "../actions/create-purchase.action";
import { purchasesQueryKey } from "../queries/query-keys";
import type { CreatePurchaseOrderInput } from "../service/purchases.service";

export function usePurchaseMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createPurchase = useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput) =>
      createPurchaseAction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: purchasesQueryKey(orgSlug),
      });
    },
  });

  return {
    createPurchase,
  };
}
