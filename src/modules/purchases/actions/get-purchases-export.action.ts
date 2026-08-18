"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllPurchasesForExport } from "@/modules/purchases/service/purchases.service";

export async function getPurchasesExportAction(
  orgSlug: string,
  estado?: string
) {
  await ensure(READ_PERMISSIONS.purchases, orgSlug);
  try {
    return await getAllPurchasesForExport(orgSlug, estado ? { estado } : {});
  } catch (error) {
    console.error("Error in getPurchasesExportAction:", error);
    return [];
  }
}
