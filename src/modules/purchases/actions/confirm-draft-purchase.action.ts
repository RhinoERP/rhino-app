"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { confirmDraftPurchaseOrder } from "../service/purchases.service";

export type ConfirmDraftPurchaseInput = {
  orgSlug: string;
  purchaseOrderId: string;
  supplierId: string;
  expirationDate?: string;
};

export type ConfirmDraftPurchaseResult = {
  success: boolean;
  error?: string;
};

export async function confirmDraftPurchaseAction(
  input: ConfirmDraftPurchaseInput
): Promise<ConfirmDraftPurchaseResult> {
  await ensure("purchases.manage", input.orgSlug);
  try {
    await confirmDraftPurchaseOrder(input);

    revalidatePath(`/org/${input.orgSlug}/compras`);
    revalidatePath(`/org/${input.orgSlug}/pedidos`);
    revalidatePath(`/org/${input.orgSlug}/compras/stock-pedidos`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al confirmar pre-compra";
    return { success: false, error: message };
  }
}
