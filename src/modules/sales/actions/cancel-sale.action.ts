"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { cancelSaleOrder } from "../service/sales.service";
import type { SalesOrderStatus } from "../types";

export type CancelSaleActionResult = {
  success: boolean;
  status?: SalesOrderStatus;
  wasUpdated?: boolean;
  error?: string;
};

export async function cancelSaleAction(
  orgSlug: string,
  saleId: string
): Promise<CancelSaleActionResult> {
  await ensure("sales.manage", orgSlug);
  try {
    const result = await cancelSaleOrder(orgSlug, saleId);

    if (result.wasUpdated) {
      revalidatePath(`/org/${orgSlug}/ventas`);
      revalidatePath(`/org/${orgSlug}/cobranzas`);
      revalidatePath(`/org/${orgSlug}/ventas/${saleId}`);
    }

    return {
      success: true,
      status: result.status,
      wasUpdated: result.wasUpdated,
    };
  } catch (error) {
    console.error("Error cancelando la venta:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al cancelar la venta",
    };
  }
}
