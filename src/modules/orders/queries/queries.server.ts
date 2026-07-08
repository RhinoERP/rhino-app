import { queryOptions } from "@tanstack/react-query";

export const ordersQueryKeys = {
  all: (orgSlug: string) => ["orders", orgSlug] as const,
  list: (orgSlug: string) => [...ordersQueryKeys.all(orgSlug), "list"] as const,
  detail: (orgSlug: string, orderId: string) =>
    [...ordersQueryKeys.all(orgSlug), "detail", orderId] as const,
  counts: (orgSlug: string) =>
    [...ordersQueryKeys.all(orgSlug), "counts"] as const,
};

export const ordersServerQueryOptions = (orgSlug: string) =>
  queryOptions({
    queryKey: ordersQueryKeys.list(orgSlug),
    queryFn: async () => {
      const { getOrdersByOrg } = await import(
        "@/modules/orders/service/orders.service"
      );
      return getOrdersByOrg(orgSlug);
    },
    staleTime: 30 * 1000,
  });

export const orderDetailServerQueryOptions = (
  orgSlug: string,
  orderId: string
) =>
  queryOptions({
    queryKey: ordersQueryKeys.detail(orgSlug, orderId),
    queryFn: async () => {
      const { getOrderById } = await import(
        "@/modules/orders/service/orders.service"
      );
      return getOrderById(orgSlug, orderId);
    },
    staleTime: 30 * 1000,
  });

export const orderCountsServerQueryOptions = (orgSlug: string) =>
  queryOptions({
    queryKey: ordersQueryKeys.counts(orgSlug),
    queryFn: async () => {
      const { getOrderCounts } = await import(
        "@/modules/orders/service/orders.service"
      );
      return getOrderCounts(orgSlug);
    },
    staleTime: 60 * 1000,
  });
