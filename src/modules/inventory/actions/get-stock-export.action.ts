"use server";

import { getAllStockForExport } from "@/modules/inventory/service/inventory.service";
import { getStockReadScope } from "@/modules/inventory/utils/stock-read-scope";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getStockExportAction(
  orgSlug: string,
  filters?: {
    warehouseId?: string;
    search?: string;
    category?: string;
    status?: string;
  }
) {
  await ensure(
    [...READ_PERMISSIONS.inventory, ...READ_PERMISSIONS.mercadolibre],
    orgSlug
  );
  try {
    const layoutData = await getOrganizationLayoutData(orgSlug);
    const permissions = layoutData?.permissions ?? [];
    const isMercadoLibreOnly =
      getStockReadScope(permissions) === "mercadolibre";
    return await getAllStockForExport(orgSlug, {
      ...filters,
      skuPrefix: isMercadoLibreOnly ? "MELI-" : undefined,
    });
  } catch (error) {
    console.error("Error in getStockExportAction:", error);
    throw new Error("No se pudo exportar el stock");
  }
}
