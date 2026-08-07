"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAllQuotesForExport } from "@/modules/quotes/service/quotes.service";

export async function getQuotesExportAction(
  orgSlug: string,
  status?: string,
  customerId?: string
) {
  await ensure(["quotes.read", "quotes.read.all", "quotes.manage"], orgSlug);
  try {
    return await getAllQuotesForExport(orgSlug, { status, customerId });
  } catch (error) {
    console.error("Error in getQuotesExportAction:", error);
    return [];
  }
}
