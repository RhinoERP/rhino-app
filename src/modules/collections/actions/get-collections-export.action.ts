"use server";

import {
  getAllPayablesForExport,
  getAllReceivablesForExport,
} from "@/modules/collections/service/collections.service";

export async function getReceivablesExportAction(orgSlug: string): Promise<
  | {
      success: true;
      data: Awaited<ReturnType<typeof getAllReceivablesForExport>>;
    }
  | { success: false; error: string }
> {
  try {
    const data = await getAllReceivablesForExport(orgSlug);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al exportar cobranzas",
    };
  }
}

export async function getPayablesExportAction(
  orgSlug: string
): Promise<
  | { success: true; data: Awaited<ReturnType<typeof getAllPayablesForExport>> }
  | { success: false; error: string }
> {
  try {
    const data = await getAllPayablesForExport(orgSlug);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al exportar cobranzas",
    };
  }
}
