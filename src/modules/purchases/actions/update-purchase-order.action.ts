"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type UpdatePurchaseOrderInput,
  updatePurchaseOrder,
} from "../service/purchases.service";

export async function updatePurchaseOrderAction(
  input: UpdatePurchaseOrderInput
) {
  await ensure("purchases.manage", input.orgSlug);
  try {
    const purchaseOrder = await updatePurchaseOrder(input);

    revalidatePath(`/org/${input.orgSlug}/compras`);
    revalidatePath(`/org/${input.orgSlug}/compras/${input.purchaseOrderId}`);
    revalidatePath(`/org/${input.orgSlug}/cobranzas`);

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
