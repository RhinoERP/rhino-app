"use server";

import { getAllStockForExport } from "@/modules/inventory/service/inventory.service";

export async function getStockExportAction(orgSlug: string) {
  try {
    return await getAllStockForExport(orgSlug);
  } catch (error) {
    console.error("Error in getStockExportAction:", error);
    return [];
  }
}
