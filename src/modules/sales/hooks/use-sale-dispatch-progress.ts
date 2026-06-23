"use client";

import { useQuery } from "@tanstack/react-query";
import { getSaleDispatchProgressAction } from "@/modules/orders/actions/get-sale-dispatch-progress.action";
import { saleDispatchProgressKey } from "../queries/query-keys";

export function useSaleDispatchProgress(
  orgSlug: string,
  saleId: string,
  enabled?: boolean
) {
  return useQuery({
    queryKey: saleDispatchProgressKey(orgSlug, saleId),
    queryFn: () => getSaleDispatchProgressAction(orgSlug, saleId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: !!enabled,
  });
}
