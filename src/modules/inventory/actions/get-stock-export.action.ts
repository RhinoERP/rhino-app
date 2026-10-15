"use server";

import { getAllStockForExport } from "@/modules/inventory/service/inventory.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getStockExportAction(orgSlug: string) {
  await ensure(
    [...READ_PERMISSIONS.inventory, ...READ_PERMISSIONS.mercadolibre],
    orgSlug
  );
  try {
    const layoutData = await getOrganizationLayoutData(orgSlug);
    const permissions = layoutData?.permissions ?? [];
    const isMercadoLibreOnly =
      permissions.includes("mercadolibre.access") &&
      !permissions.includes("organization.admin") &&
      !permissions.some((permission) =>
        READ_PERMISSIONS.inventory.includes(permission)
      );
    return await getAllStockForExport(orgSlug, {
      skuPrefix: isMercadoLibreOnly ? "MELI-" : undefined,
    });
  } catch (error) {
    console.error("Error in getStockExportAction:", error);
    return [];
  }
}
