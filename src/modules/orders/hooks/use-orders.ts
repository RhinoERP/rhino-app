"use client";

import { useQuery } from "@tanstack/react-query";
import { ordersClientQueryOptions } from "../queries/queries.client";
import type { OrderWithDetails } from "../types";

export function useOrders(
  orgSlug: string,
  initialData: OrderWithDetails[] = []
) {
  return useQuery<OrderWithDetails[]>({
    ...ordersClientQueryOptions(orgSlug),
    initialData,
  });
}
