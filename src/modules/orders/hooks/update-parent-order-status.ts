import { createClient } from "@/lib/supabase/server";
import type { OrderFlowStatus } from "../types";

export const updateParentOrderStatus = async (
  newStatus: OrderFlowStatus,
  parentOrderId: string,
  orgId: string
) => {
  const supabase = await createClient();

  // Fetch current status first
  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", parentOrderId)
    .eq("organization_id", orgId)
    .single();

  if (fetchError || !currentOrder) {
    throw new Error(
      `Error al obtener estado actual del pedido: ${fetchError?.message || "Pedido no encontrado"}`
    );
  }

  // Skip if status hasn't changed
  if (currentOrder.status === newStatus) {
    return;
  }

  const now = new Date().toISOString();
  const previousStatus = currentOrder.status;

  // Update status
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: newStatus,
      updated_at: now,
    })
    .eq("id", parentOrderId)
    .eq("organization_id", orgId);

  if (updateError) {
    throw new Error(
      `Error al actualizar estado del pedido principal: ${updateError.message}`
    );
  }

  // Record the status change
  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: parentOrderId,
      from_status: previousStatus,
      to_status: newStatus,
      changed_by: null,
      changed_at: now,
      notes: "Recalculado automáticamente por cambio en sub pedidos",
    });

  if (historyError) {
    throw new Error(
      `Error al registrar cambio de estado: ${historyError.message}`
    );
  }
};
