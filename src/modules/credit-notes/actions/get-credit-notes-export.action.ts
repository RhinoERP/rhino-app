"use server";

import { getAllCreditNotesForExport } from "@/modules/credit-notes/service/credit-notes.service";

export async function getCreditNotesExportAction(
  orgSlug: string,
  status?: string
) {
  try {
    return await getAllCreditNotesForExport(orgSlug, status ? { status } : {});
  } catch (error) {
    console.error("Error in getCreditNotesExportAction:", error);
    return [];
  }
}
