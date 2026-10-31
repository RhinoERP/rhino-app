"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getAvailableWarehouses } from "../service/warehouse-stock.service";

export async function getInventoryWarehousesAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.inventory, orgSlug);
  const warehouses = await getAvailableWarehouses(orgSlug);
  return warehouses.map(({ id, name }) => ({ id, name }));
}
