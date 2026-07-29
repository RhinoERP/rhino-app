"use server";

import { getAllCustomersForExport } from "@/modules/customers/service/customers.service";

export async function getCustomersExportAction(orgSlug: string) {
  try {
    return await getAllCustomersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getCustomersExportAction:", error);
    return [];
  }
}
