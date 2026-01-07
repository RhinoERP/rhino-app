"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSalesPriceListAction } from "../actions/update-sales-price-list.action";
import { salesPriceListsQueryKey } from "../queries/query-keys";
import type { UpdateSalesPriceListInput } from "../types";

export function useUpdateSalesPriceListMutation(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      priceListId,
      input,
    }: {
      priceListId: string;
      input: UpdateSalesPriceListInput;
    }) => updateSalesPriceListAction(orgSlug, priceListId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: salesPriceListsQueryKey(orgSlug),
      });
    },
  });
}
