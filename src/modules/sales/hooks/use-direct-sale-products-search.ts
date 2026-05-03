"use client";

import { useQuery } from "@tanstack/react-query";
import { directSaleProductsClientQueryOptions } from "../queries/queries.client";

export function useDirectSaleProductsSearch(
  orgSlug: string,
  search: string,
  limit = 20,
  enabled = true
) {
  return useQuery({
    ...directSaleProductsClientQueryOptions({
      orgSlug,
      search,
      limit,
    }),
    enabled,
  });
}
