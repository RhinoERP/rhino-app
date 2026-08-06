"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllSalesForExport } from "@/modules/sales/service/sales.service";

export async function getSalesExportAction(orgSlug: string) {
  await ensure(["sales.read", "sales.manage"], orgSlug);
  try {
    return await getAllSalesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getSalesExportAction:", error);
    return [];
  }
}
