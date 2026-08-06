"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreatePurchaseOrderInput,
  createPurchaseOrder,
} from "../service/purchases.service";

export async function createPurchaseAction(input: CreatePurchaseOrderInput) {
  await ensure("purchases.manage", input.orgSlug);
  try {
    const purchaseOrder = await createPurchaseOrder(input);

    revalidatePath(`/org/${input.orgSlug}/compras`);
    revalidatePath(`/org/${input.orgSlug}/cobranzas`);

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
