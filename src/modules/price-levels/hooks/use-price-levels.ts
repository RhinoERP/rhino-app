"use client";

import { useQuery } from "@tanstack/react-query";
import { priceLevelsClientQueryOptions } from "../queries/queries.client";
import type { PriceLevelWithStatus } from "../types";

export function usePriceLevels(orgSlug: string) {
  return useQuery<PriceLevelWithStatus[]>({
    ...priceLevelsClientQueryOptions(orgSlug),
    initialData: [] as PriceLevelWithStatus[],
  });
}
