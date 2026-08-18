"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllQuotesForExport } from "@/modules/quotes/service/quotes.service";

export async function getQuotesExportAction(
  orgSlug: string,
  status?: string,
  customerId?: string
) {
  await ensure(READ_PERMISSIONS.quotes, orgSlug);
  try {
    return await getAllQuotesForExport(orgSlug, { status, customerId });
  } catch (error) {
    console.error("Error in getQuotesExportAction:", error);
    return [];
  }
}
