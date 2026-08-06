"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllSuppliersForExport } from "@/modules/suppliers/service/suppliers.service";

export async function getSuppliersExportAction(orgSlug: string) {
  await ensure("suppliers.manage", orgSlug);
  try {
    return await getAllSuppliersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getSuppliersExportAction:", error);
    return [];
  }
}
