"use server";

import { getAllPurchasesForExport } from "@/modules/purchases/service/purchases.service";

export async function getPurchasesExportAction(
  orgSlug: string,
  estado?: string
) {
  try {
    return await getAllPurchasesForExport(orgSlug, estado ? { estado } : {});
  } catch (error) {
    console.error("Error in getPurchasesExportAction:", error);
    return [];
  }
}
