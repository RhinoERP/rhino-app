import { useQuery } from "@tanstack/react-query";
import { getOrderDispatchEventsAction } from "../actions/get-order-dispatch-events.action";

export function useOrderDispatchEvents(orgSlug: string, orderIds: string[]) {
  const sortedIds = [...orderIds].sort();

  return useQuery({
    queryKey: ["order-dispatch-events", orgSlug, sortedIds],
    queryFn: () => getOrderDispatchEventsAction(orgSlug, sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: 30_000,
  });
}
