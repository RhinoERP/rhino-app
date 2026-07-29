"use server";

import { getAllCommissionsForExport } from "../service/commissions.service";

export async function getCommissionsExportAction(
  orgSlug: string,
  month?: string
): Promise<
  | {
      success: true;
      data: Awaited<ReturnType<typeof getAllCommissionsForExport>>;
    }
  | { success: false; error: string }
> {
  try {
    const data = await getAllCommissionsForExport(orgSlug, month);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al exportar comisiones",
    };
  }
}
