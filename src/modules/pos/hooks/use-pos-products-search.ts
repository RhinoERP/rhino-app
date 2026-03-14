"use client";

import { useQuery } from "@tanstack/react-query";
import { posProductsSearchClientQueryOptions } from "../queries/pos.client";

export function usePosProductsSearch(
  orgSlug: string,
  search: string,
  limit = 20,
  enabled = true
) {
  return useQuery({
    ...posProductsSearchClientQueryOptions({
      orgSlug,
      search,
      limit,
    }),
    enabled,
  });
}
