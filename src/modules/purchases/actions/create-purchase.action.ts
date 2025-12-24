"use server";

import { revalidatePath } from "next/cache";
import {
  type CreatePurchaseOrderInput,
  createPurchaseOrder,
} from "../service/purchases.service";

export async function createPurchaseAction(input: CreatePurchaseOrderInput) {
  try {
    const purchaseOrder = await createPurchaseOrder(input);

    revalidatePath(`/org/${input.orgSlug}/compras`);

    return {
      success: true,
      data: purchaseOrder,
    };
  } catch (error) {
    console.error("Error creating purchase order:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al crear la compra",
    };
  }
}
