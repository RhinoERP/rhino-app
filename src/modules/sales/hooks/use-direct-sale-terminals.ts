"use client";

import { useQuery } from "@tanstack/react-query";
import {
  directSaleDefaultOpenTerminalClientQueryOptions,
  directSaleTerminalsClientQueryOptions,
} from "../queries/queries.client";
import type {
  DirectSaleDefaultOpenTerminal,
  DirectSaleTerminal,
} from "../types";

export function useDirectSaleTerminals(orgSlug: string) {
  return useQuery<DirectSaleTerminal[]>(
    directSaleTerminalsClientQueryOptions(orgSlug)
  );
}

export function useDefaultOpenDirectSaleTerminal(orgSlug: string) {
  return useQuery<DirectSaleDefaultOpenTerminal | null>(
    directSaleDefaultOpenTerminalClientQueryOptions(orgSlug)
  );
}
