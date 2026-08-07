"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getOrderCounts } from "../service/orders.service";

export async function getOrderCountsAction(orgSlug: string) {
  await ensure(
    [
      "orders.read",
      "orders.manage",
      "orders.finance_review",
      "orders.stock_review",
      "orders.production",
      "orders.dispatch",
    ],
    orgSlug
  );
  return getOrderCounts(orgSlug);
}
