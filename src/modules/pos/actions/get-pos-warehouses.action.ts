"use server";

import { getAvailableWarehouses } from "@/modules/inventory/service/warehouse-stock.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getPosWarehousesAction(orgSlug: string) {
  await ensure("pos.manage", orgSlug);
  const warehouses = await getAvailableWarehouses(orgSlug, "direct_sale");
  return warehouses.map(({ id, name, is_default }) => ({
    id,
    name,
    isDefault: is_default,
  }));
}
