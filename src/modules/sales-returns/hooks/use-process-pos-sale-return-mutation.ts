"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { directSalesQueryKey } from "@/modules/sales/queries/query-keys";
import { processPosSaleReturnAction } from "../actions/process-pos-sale-return.action";
import { posSaleReturnableItemsQueryKey } from "../queries/query-keys";
import type { ProcessPosSaleReturnInput } from "../types";

export function useProcessPosSaleReturnMutation(
  orgSlug: string,
  posSaleId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<ProcessPosSaleReturnInput, "orgSlug">) => {
      const result = await processPosSaleReturnAction({
        orgSlug,
        ...input,
      });

      if (!result.success) {
        throw new Error(
          result.error ?? "No se pudo procesar la devolución POS."
        );
      }

      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: directSalesQueryKey(orgSlug),
      });
      await queryClient.invalidateQueries({
        queryKey: posSaleReturnableItemsQueryKey(orgSlug, posSaleId),
      });
    },
  });
}
