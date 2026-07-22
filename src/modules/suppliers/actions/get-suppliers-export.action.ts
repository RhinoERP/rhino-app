"use server";

import { getAllSuppliersForExport } from "@/modules/suppliers/service/suppliers.service";

export async function getSuppliersExportAction(orgSlug: string) {
  try {
    return await getAllSuppliersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getSuppliersExportAction:", error);
    return [];
  }
}
