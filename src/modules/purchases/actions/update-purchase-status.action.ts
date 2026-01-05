"use server";

import { revalidatePath } from "next/cache";
import { updatePurchaseOrderStatus } from "../service/purchases.service";

export async function updatePurchaseStatusAction(
  orgSlug: string,
  purchaseOrderId: string,
  status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED",
  options?: {
    delivery_date?: string;
    logistics?: string;
  }
) {
  try {
    const purchaseOrder = await updatePurchaseOrderStatus(
      orgSlug,
      purchaseOrderId,
      status,
      options
    );

    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);

    return {
      success: true,
      data: purchaseOrder,
    };
  } catch (error) {
    console.error("Error updating purchase order status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar el estado de la compra",
    };
  }
}
