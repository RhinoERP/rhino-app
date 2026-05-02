"use client";

import { useQuery } from "@tanstack/react-query";
import { carriersClientQueryOptions } from "../queries/queries.client";
import type { Carrier } from "../service/carriers.service";

export function useCarriers(orgSlug: string) {
  return useQuery<Carrier[]>(carriersClientQueryOptions(orgSlug));
}
