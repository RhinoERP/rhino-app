"use server";

import { getAllOrdersForExport } from "@/modules/orders/service/orders-export.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getOrdersExportAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.orders, orgSlug);
  try {
    return await getAllOrdersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getOrdersExportAction:", error);
    return [];
  }
}
