"use server";

import { getAllOrdersForExport } from "@/modules/orders/service/orders-export.service";

export async function getOrdersExportAction(orgSlug: string) {
  try {
    return await getAllOrdersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getOrdersExportAction:", error);
    return [];
  }
}
