"use server";

import { dispatchSaleOrder } from "../service/sales.service";
import type { DispatchSaleOrderInput, SalesOrderStatus } from "../types";

export type DispatchSaleActionResult = {
  success: boolean;
  status?: SalesOrderStatus;
  error?: string;
};

export async function dispatchSaleAction(
  input: DispatchSaleOrderInput
): Promise<DispatchSaleActionResult> {
  try {
    const result = await dispatchSaleOrder(input);

    return {
      success: true,
      status: result.status,
    };
  } catch (error) {
    console.error("Error dispatching sale:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al despachar la venta",
    };
  }
}
