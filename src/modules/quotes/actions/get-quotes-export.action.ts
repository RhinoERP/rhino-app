"use server";

import { getAllQuotesForExport } from "@/modules/quotes/service/quotes.service";

export async function getQuotesExportAction(
  orgSlug: string,
  status?: string,
  customerId?: string
) {
  try {
    return await getAllQuotesForExport(orgSlug, { status, customerId });
  } catch (error) {
    console.error("Error in getQuotesExportAction:", error);
    return [];
  }
}
