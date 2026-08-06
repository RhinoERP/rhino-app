"use server";

import { revalidatePath } from "next/cache";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { recalcParentOrderStatus } from "../service/orders.service";

export type ConfirmStockReviewResult = {
  success: boolean;
  error?: string;
};

export async function confirmStockReviewAction(
  orgSlug: string,
  parentOrderId: string
): Promise<ConfirmStockReviewResult> {
  await ensure("orders.stock_review", orgSlug);
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      throw new Error("Organización no encontrada");
    }

    await recalcParentOrderStatus(parentOrderId, org.id);

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
