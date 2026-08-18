"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllSuppliersForExport } from "@/modules/suppliers/service/suppliers.service";

export async function getSuppliersExportAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.suppliers, orgSlug);
  try {
    return await getAllSuppliersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getSuppliersExportAction:", error);
    return [];
  }
}
