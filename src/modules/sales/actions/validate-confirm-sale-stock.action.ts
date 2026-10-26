"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { validateStockBeforeSaleConfirmation } from "../service/sales.service";
import type { ConfirmSaleOrderInput } from "../types";

export async function validateConfirmSaleStockAction(
  input: ConfirmSaleOrderInput
): Promise<{ success: true } | { success: false; error: string }> {
  await ensure("sales.manage", input.orgSlug);
  try {
    await validateStockBeforeSaleConfirmation(input);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo validar el stock de la venta",
    };
  }
}
