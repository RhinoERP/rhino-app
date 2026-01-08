"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSaleAction } from "../actions/update-sale.action";
import { salesQueryKey } from "../queries/query-keys";
import type { UpdateSaleOrderInput } from "../types";

export function useUpdateSaleMutation(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSaleOrderInput) => updateSaleAction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      queryClient.invalidateQueries({
        queryKey: ["sale-order", orgSlug],
      });
    },
  });
}
