"use server";

import { getAllCreditNotesForExport } from "@/modules/credit-notes/service/credit-notes.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getCreditNotesExportAction(
  orgSlug: string,
  status?: string
) {
  await ensure("creditnotes.manage", orgSlug);
  try {
    return await getAllCreditNotesForExport(orgSlug, status ? { status } : {});
  } catch (error) {
    console.error("Error in getCreditNotesExportAction:", error);
    return [];
  }
}
