"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getOrderCounts } from "../service/orders.service";

export async function getOrderCountsAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.orders, orgSlug);
  return getOrderCounts(orgSlug);
}
