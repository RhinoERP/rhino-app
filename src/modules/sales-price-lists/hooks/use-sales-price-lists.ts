"use client";

import { useQuery } from "@tanstack/react-query";
import { salesPriceListsClientQueryOptions } from "../queries/queries.client";
import type { SalesPriceList } from "../types";

export function useSalesPriceLists(orgSlug: string) {
  return useQuery<SalesPriceList[]>({
    ...salesPriceListsClientQueryOptions(orgSlug),
    initialData: [] as SalesPriceList[],
  });
}
