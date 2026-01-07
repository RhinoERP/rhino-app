"use server";

import { revalidatePath } from "next/cache";
import { updateSaleOrder } from "../service/sales.service";
import type { UpdateSaleOrderInput } from "../types";

export async function updateSaleAction(input: UpdateSaleOrderInput) {
  try {
    const saleOrder = await updateSaleOrder(input);

    revalidatePath(`/org/${input.orgSlug}/ventas`);
    revalidatePath(`/org/${input.orgSlug}/ventas/${input.saleId}`);

    return {
      success: true,
      data: saleOrder,
    };
  } catch (error) {
    console.error("Error updating sale order:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar la orden de venta",
    };
  }
}
