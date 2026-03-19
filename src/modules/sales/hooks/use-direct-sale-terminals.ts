"use client";

import { useQuery } from "@tanstack/react-query";
import { directSaleTerminalsClientQueryOptions } from "../queries/queries.client";
import type { DirectSaleTerminal } from "../types";

export function useDirectSaleTerminals(orgSlug: string) {
  return useQuery<DirectSaleTerminal[]>(
    directSaleTerminalsClientQueryOptions(orgSlug)
  );
}
