"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
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
    await ensure(READ_PERMISSIONS.commissions, orgSlug);
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
