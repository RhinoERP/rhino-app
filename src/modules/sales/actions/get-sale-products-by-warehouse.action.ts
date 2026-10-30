"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getSaleProducts } from "../service/sales.service";

export async function getSaleProductsByWarehouseAction(
  orgSlug: string,
  warehouseId: string
) {
  await ensure("sales.manage", orgSlug);
  return getSaleProducts(orgSlug, warehouseId);
}
