"use server";

import { getAllCommissionsForExport } from "../service/commissions.service";

export async function getCommissionsExportAction(
  orgSlug: string,
  month?: string
) {
  return await getAllCommissionsForExport(orgSlug, month);
}
