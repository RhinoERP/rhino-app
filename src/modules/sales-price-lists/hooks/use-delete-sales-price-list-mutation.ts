"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteSalesPriceListAction } from "../actions/delete-sales-price-list.action";
import { salesPriceListsQueryKey } from "../queries/query-keys";

export function useDeleteSalesPriceListMutation(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (priceListId: string) =>
      deleteSalesPriceListAction(orgSlug, priceListId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: salesPriceListsQueryKey(orgSlug),
      });
    },
  });
}
