"use client";

import { useQuery } from "@tanstack/react-query";
import { priceListsClientQueryOptions } from "../queries/queries.client";
import type { PriceList } from "../types";

export function usePriceLists(orgSlug: string) {
  return useQuery<PriceList[]>({
    ...priceListsClientQueryOptions(orgSlug),
    initialData: [],
  });
}
