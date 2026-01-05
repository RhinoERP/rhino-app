"use server";

import { revalidatePath } from "next/cache";
import {
  type UpdatePurchaseOrderInput,
  updatePurchaseOrder,
} from "../service/purchases.service";

export async function updatePurchaseOrderAction(
  input: UpdatePurchaseOrderInput
) {
  try {
    const purchaseOrder = await updatePurchaseOrder(input);

    revalidatePath(`/org/${input.orgSlug}/compras`);
    revalidatePath(`/org/${input.orgSlug}/compras/${input.purchaseOrderId}`);

    return {
      success: true,
      data: purchaseOrder,
    };
  } catch (error) {
    console.error("Error updating purchase order:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar la orden de compra",
    };
  }
}
