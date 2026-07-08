"use server";

import { revalidatePath } from "next/cache";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { recalcParentOrderStatus } from "../service/orders.service";

export type ConfirmStockReviewResult = {
  success: boolean;
  error?: string;
};

export async function confirmStockReviewAction(
  orgSlug: string,
  parentOrderId: string
): Promise<ConfirmStockReviewResult> {
  try {
    await guardOrganizationPermissionAccess(orgSlug, "orders.stock_review");
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
