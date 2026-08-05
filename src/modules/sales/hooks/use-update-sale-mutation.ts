"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSaleAction } from "../actions/update-sale.action";
import { saleDispatchProgressKey, salesQueryKey } from "../queries/query-keys";
import type { UpdateSaleOrderInput } from "../types";

export function useUpdateSaleMutation(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSaleOrderInput) => {
      const result = await updateSaleAction(input);

      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar la venta");
      }

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      queryClient.invalidateQueries({
        queryKey: ["sale-order", orgSlug],
      });
      queryClient.invalidateQueries({
        queryKey: saleDispatchProgressKey(orgSlug, variables.saleId),
      });
      queryClient.invalidateQueries({
        queryKey: ["collections"],
      });
      queryClient.invalidateQueries({
        queryKey: ["receivables"],
      });
      queryClient.invalidateQueries({
        queryKey: ["customer-credit"],
      });
    },
  });
}
