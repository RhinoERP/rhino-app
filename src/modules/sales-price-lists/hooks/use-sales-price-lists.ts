"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { salesPriceListsClientQueryOptions } from "../queries/queries.client";
import type { SalesPriceList } from "../types";

export function useSalesPriceLists(orgSlug: string) {
  return useSuspenseQuery<SalesPriceList[]>(
    salesPriceListsClientQueryOptions(orgSlug)
  );
}
