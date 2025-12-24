"use client";

import { useQuery } from "@tanstack/react-query";
import { taxesClientQueryOptions } from "../queries/queries.client";
import type { Tax } from "../service/taxes.service";

export function useTaxes() {
  return useQuery<Tax[]>(taxesClientQueryOptions());
}
