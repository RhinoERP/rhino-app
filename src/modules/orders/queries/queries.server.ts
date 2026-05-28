import { getOrderById, getOrdersByOrg } from "../service/orders.service";
import { orderDetailQueryKey, ordersQueryKey } from "./query-keys";

export const ordersServerQueryOptions = (orgSlug: string) => ({
  queryKey: ordersQueryKey(orgSlug),
  queryFn: () => getOrdersByOrg(orgSlug),
});

export const orderDetailServerQueryOptions = (
  orgSlug: string,
  orderId: string
) => ({
  queryKey: orderDetailQueryKey(orgSlug, orderId),
  queryFn: () => getOrderById(orgSlug, orderId),
});
