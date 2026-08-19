"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllSalesForExport } from "@/modules/sales/service/sales.service";

export async function getSalesExportAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.sales, orgSlug);
  try {
    return await getAllSalesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getSalesExportAction:", error);
    return [];
  }
}
