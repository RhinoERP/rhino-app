"use server";

import { getAllCustomersForExport } from "@/modules/customers/service/customers.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getCustomersExportAction(orgSlug: string) {
  await ensure("customers.manage", orgSlug);
  try {
    return await getAllCustomersForExport(orgSlug);
  } catch (error) {
    console.error("Error in getCustomersExportAction:", error);
    return [];
  }
}
