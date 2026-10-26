"use server";

import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getSupplierCommissionRatesByOrg } from "../service/supplier-commission-rates.service";

export type GetSupplierCommissionRatesActionResult =
  | {
      success: true;
      data: Awaited<ReturnType<typeof getSupplierCommissionRatesByOrg>>;
    }
  | { success: false; error: string };

export async function getSupplierCommissionRatesAction(
  orgSlug: string
): Promise<GetSupplierCommissionRatesActionResult> {
  try {
    await ensure(READ_PERMISSIONS.commissions, orgSlug);
    const data = await getSupplierCommissionRatesByOrg(orgSlug);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al obtener comisiones por proveedor",
    };
  }
}
