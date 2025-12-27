"use server";

import { deliverSaleOrder } from "../service/sales.service";
import type { DeliverSaleOrderInput, SalesOrderStatus } from "../types";

export type DeliverSaleActionResult = {
  success: boolean;
  status?: SalesOrderStatus;
  error?: string;
};

export async function deliverSaleAction(
  input: DeliverSaleOrderInput
): Promise<DeliverSaleActionResult> {
  try {
    const result = await deliverSaleOrder(input);

    return {
      success: true,
      status: result.status,
    };
  } catch (error) {
    console.error("Error delivering sale:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al marcar la venta como entregada",
    };
  }
}
