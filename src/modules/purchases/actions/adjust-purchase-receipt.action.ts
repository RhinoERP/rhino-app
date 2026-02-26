"use server";

import { revalidatePath } from "next/cache";
import {
  updatePurchaseOrderTaxesOnly,
  updateReceivedPurchaseOrderItems,
} from "../service/purchases.service";

export type AdjustReceiptItemInput = {
  itemId: string;
  unitQuantity?: number;
  quantity?: number;
  unitCost?: number;
};

export type AdjustPurchaseReceiptInput = {
  orgSlug: string;
  purchaseOrderId: string;
  items: AdjustReceiptItemInput[];
  taxes?: {
    tax_id: string;
    name: string;
    rate: number;
  }[];
};

export async function adjustPurchaseReceiptAction(
  input: AdjustPurchaseReceiptInput
) {
  try {
    const { orgSlug, purchaseOrderId, items, taxes } = input;

    // Update items with adjusted values
    await updateReceivedPurchaseOrderItems(orgSlug, purchaseOrderId, items);

    // Update taxes if provided
    if (taxes !== undefined) {
      await updatePurchaseOrderTaxesOnly(orgSlug, purchaseOrderId, taxes);
    }

    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}/recibir`);
    revalidatePath(`/org/${orgSlug}/compras`);
    revalidatePath(`/org/${orgSlug}/compras/${purchaseOrderId}`);
    revalidatePath(`/org/${orgSlug}/cobranzas`);

    return {
      success: true,
      message: "Ajustes guardados exitosamente",
      invalidatedQueryKeys: [
        ["purchases", orgSlug],
        ["purchase-order", orgSlug, purchaseOrderId],
      ] as const,
    };
  } catch (error) {
    console.error("Error adjusting receipt:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al guardar los ajustes",
    };
  }
}
