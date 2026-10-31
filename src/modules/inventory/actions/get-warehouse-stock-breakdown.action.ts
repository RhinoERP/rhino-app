"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getWarehouseStockBreakdown } from "../service/warehouse-stock-report.service";

export async function getWarehouseStockBreakdownAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.inventory, orgSlug);
  return getWarehouseStockBreakdown(orgSlug);
}
