"use client";

import { useQuery } from "@tanstack/react-query";
import { directSaleProductsClientQueryOptions } from "../queries/queries.client";

export function useDirectSaleProductsSearch(params: {
  orgSlug: string;
  search: string;
  limit?: number;
  enabled?: boolean;
  terminalId?: string;
  sessionId?: string;
}) {
  return useQuery({
    ...directSaleProductsClientQueryOptions({
      ...params,
    }),
    enabled: params.enabled ?? true,
  });
}
