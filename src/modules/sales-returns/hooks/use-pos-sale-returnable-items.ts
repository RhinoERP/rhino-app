"use client";

import { useQuery } from "@tanstack/react-query";
import { posSaleReturnableItemsClientQueryOptions } from "../queries/queries.client";

export function usePosSaleReturnableItems(
  orgSlug: string,
  posSaleId: string,
  enabled = true
) {
  return useQuery({
    ...posSaleReturnableItemsClientQueryOptions({
      orgSlug,
      posSaleId,
    }),
    enabled: Boolean(orgSlug && posSaleId && enabled),
  });
}
