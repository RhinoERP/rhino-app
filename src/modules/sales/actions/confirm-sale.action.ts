"use server";

import { confirmSaleOrder } from "../service/sales.service";
import type { ConfirmSaleOrderInput, SalesOrderStatus } from "../types";

export type ConfirmSaleActionResult = {
  success: boolean;
  status?: SalesOrderStatus;
  error?: string;
};

export async function confirmSaleAction(
  input: ConfirmSaleOrderInput
): Promise<ConfirmSaleActionResult> {
  try {
    const result = await confirmSaleOrder(input);

    return {
      success: true,
      status: result.status,
    };
  } catch (error) {
    console.error("Error confirming sale:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al confirmar la venta",
    };
  }
}
