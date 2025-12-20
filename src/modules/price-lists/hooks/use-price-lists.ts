"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { priceListsClientQueryOptions } from "../queries/queries.client";
import type { PriceList } from "../types";

export function usePriceLists(orgSlug: string) {
  return useSuspenseQuery<PriceList[]>(priceListsClientQueryOptions(orgSlug));
}
