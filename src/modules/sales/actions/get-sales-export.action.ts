"use server";

import { getAllSalesForExport } from "@/modules/sales/service/sales.service";

export async function getSalesExportAction(orgSlug: string) {
  try {
    return await getAllSalesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getSalesExportAction:", error);
    return [];
  }
}
