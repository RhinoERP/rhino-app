"use client";

import { useQuery } from "@tanstack/react-query";
import { posTerminalsClientQueryOptions } from "../queries/pos.client";
import type { PosTerminal } from "../types";

export function usePosTerminals(orgSlug: string) {
  return useQuery<PosTerminal[]>(posTerminalsClientQueryOptions(orgSlug));
}
