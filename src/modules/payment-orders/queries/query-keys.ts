export const paymentOrdersQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "payment-orders"] as const;
