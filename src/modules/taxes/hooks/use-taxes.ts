"use client";

import { useQuery } from "@tanstack/react-query";
import { taxesClientQueryOptions } from "@/modules/taxes/queries/queries.client";
import type { Tax } from "@/modules/taxes/types";

export function useTaxes(orgSlug: string) {
  return useQuery<Tax[]>(taxesClientQueryOptions(orgSlug));
}
