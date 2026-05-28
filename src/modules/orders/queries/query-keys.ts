export const ordersQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "orders"] as const;

export const orderDetailQueryKey = (orgSlug: string, orderId: string) =>
  ["org", orgSlug, "orders", orderId] as const;
