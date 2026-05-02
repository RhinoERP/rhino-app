"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateDirectSaleActionResult,
  createDirectSaleAction,
} from "../actions/create-direct-sale.action";
import { directSalesQueryKey } from "../queries/query-keys";
import type { CreateDirectSaleInput } from "../types";

type UseDirectSaleMutationOptions = {
  onSuccess?: (
    result: CreateDirectSaleActionResult,
    payload: Omit<CreateDirectSaleInput, "orgSlug">
  ) => Promise<void> | void;
};

export function useDirectSaleMutation(
  orgSlug: string,
  options: UseDirectSaleMutationOptions = {}
) {
  const queryClient = useQueryClient();

  const createDirectSale = useMutation({
    mutationFn: async (payload: Omit<CreateDirectSaleInput, "orgSlug">) => {
      const result = await createDirectSaleAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(
          result.error || "No se pudo registrar la venta directa."
        );
      }

      return result;
    },
    onSuccess: async (result, payload) => {
      await queryClient.invalidateQueries({
        queryKey: directSalesQueryKey(orgSlug),
      });

      await options.onSuccess?.(result, payload);
    },
  });

  return { createDirectSale };
}
