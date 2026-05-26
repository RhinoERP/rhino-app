"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
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

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function saveOrderDesignAction(
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

    await saveOrderDesign(orderId, designData, userId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
