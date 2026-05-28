"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/supabase/admin";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { saveOrderDesign, updateOrderStatus } from "../service/orders.service";
import type { OrderDesignRow, OrderFlowStatus } from "../types";

type UpdateStatusInput = {
  orgSlug: string;
  orderId: string;
  newStatus: OrderFlowStatus;
  notes?: string;
  extraFields?: Record<string, unknown>;
};

export async function updateOrderStatusAction(
  input: UpdateStatusInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autenticado" };
    }

    await updateOrderStatus(
      input.orgSlug,
      input.orderId,
      input.newStatus,
      input.notes ?? null,
      userId,
      input.extraFields
    );

    revalidatePath(`/org/${input.orgSlug}/pedidos`);
    revalidatePath(`/org/${input.orgSlug}/finanzas/aprobacion-pedidos`);
    revalidatePath(`/org/${input.orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${input.orgSlug}/produccion`);
    revalidatePath(`/org/${input.orgSlug}/despacho`);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function saveOrderDesignAction(
  orgSlug: string,
  orderId: string,
  designData: Omit<
    OrderDesignRow,
    "id" | "order_id" | "created_at" | "updated_at"
  >
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autenticado" };
    }

    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "Organización no encontrada" };
    }

    await saveOrderDesign(org.id, orderId, designData, userId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
