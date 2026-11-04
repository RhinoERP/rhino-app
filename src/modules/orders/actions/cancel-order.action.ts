"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isStockReentryFallbackRequired } from "@/modules/inventory/utils/stock-reentry";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { cancelOrder } from "../service/orders.service";
import type { OrderFlowStatus } from "../types";

export type CancelOrderActionResult = {
  success: boolean;
  error?: string;
  requiresDefaultFallback?: boolean;
};

export async function cancelOrderAction(
  orgSlug: string,
  orderId: string,
  notes: string,
  allowDefaultFallback = false
): Promise<CancelOrderActionResult> {
  await ensure("orders.manage", orgSlug);
  if (!notes.trim()) {
    return {
      success: false,
      error: "El motivo de cancelación es obligatorio",
    };
  }

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "No autorizado" };
  }

  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, parent_order_id, sales_order_id")
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (fetchError || !currentOrder) {
    return { success: false, error: "Pedido no encontrado" };
  }

  let result: Awaited<ReturnType<typeof cancelOrder>>;
  try {
    result = await cancelOrder(supabase, {
      allowDefaultFallback,
      orgSlug,
      orgId: org.id,
      userId: user.id,
      orderId: currentOrder.id,
      notes: notes.trim(),
      currentStatus: currentOrder.status as OrderFlowStatus,
      parentOrderId: currentOrder.parent_order_id,
      salesOrderId: currentOrder.sales_order_id,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cancelar el pedido",
      requiresDefaultFallback: isStockReentryFallbackRequired(error),
    };
  }

  if (!result.success) {
    return { success: false, error: result.error ?? "Error al cancelar" };
  }

  revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
  revalidatePath(`/org/${orgSlug}/pedidos`);

  return { success: true };
}
