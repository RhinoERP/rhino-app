import type { OrderWithDetails, OrderWithHistory } from "../types";
import { orderDetailQueryKey, ordersQueryKey } from "./query-keys";

export const ordersClientQueryOptions = (orgSlug: string) => ({
  queryKey: ordersQueryKey(orgSlug),
  queryFn: async (): Promise<OrderWithDetails[]> => {
    const res = await fetch(`/api/org/${orgSlug}/pedidos`);
    if (!res.ok) {
      throw new Error("Failed to fetch orders");
    }
    return res.json();
  },
});

export const orderDetailClientQueryOptions = (
  orgSlug: string,
  orderId: string
) => ({
  queryKey: orderDetailQueryKey(orgSlug, orderId),
  queryFn: async (): Promise<OrderWithHistory | null> => {
    const res = await fetch(`/api/org/${orgSlug}/pedidos/${orderId}`);
    if (!res.ok) {
      throw new Error("Failed to fetch order detail");
    }
    return res.json();
  },
});
