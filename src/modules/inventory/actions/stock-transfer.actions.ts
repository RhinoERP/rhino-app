"use server";

import { revalidatePath } from "next/cache";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateStockTransferInput,
  createStockTransferForOrg,
} from "../service/stock-transfer.service";
import {
  getAvailableWarehouses,
  getWarehouseTransfers,
} from "../service/warehouse-stock.service";

export async function createStockTransferAction(
  input: CreateStockTransferInput
) {
  await ensure("inventory.manage", input.orgSlug);
  try {
    const transferId = await createStockTransferForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/stock`, "layout");
    return { success: true as const, transferId };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo registrar la transferencia",
    };
  }
}

export async function getTransferWarehousesAction(orgSlug: string) {
  await ensure(READ_PERMISSIONS.inventory, orgSlug);
  const warehouses = await getAvailableWarehouses(orgSlug, undefined, {
    includeInactive: true,
  });
  return warehouses.map(({ id, name, is_active, is_default }) => ({
    id,
    name,
    isActive: is_active,
    isDefault: is_default,
  }));
}

export async function getWarehouseTransfersAction(
  orgSlug: string,
  warehouseId: string
) {
  await ensure(READ_PERMISSIONS.inventory, orgSlug);
  return getWarehouseTransfers(orgSlug, warehouseId);
}
