"use server";

import { getOrderCounts } from "../service/orders.service";

export function getOrderCountsAction(orgSlug: string) {
  return getOrderCounts(orgSlug);
}
