import { createClient } from "@/lib/supabase/server";
import type { OrderFlowStatus } from "../types";

export const updateParentOrderStatus = async (
  newStatus: OrderFlowStatus,
  parentOrderId: string,
  orgId: string,
  previousStatus?: OrderFlowStatus
) => {
  const supabase = await createClient();

  // Actualizar padre solo si el status cambió
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parentOrderId)
    .eq("organization_id", orgId);

  if (!updateError && previousStatus) {
    await supabase.from("order_status_history").insert({
      order_id: parentOrderId,
      from_status: previousStatus,
      to_status: newStatus,
      changed_by: null,
      changed_at: new Date().toISOString(),
      notes: "Recalculado automáticamente por cambio en pedidos hijos",
    });
  }

  if (updateError) {
    throw new Error(
      `Error al actualizar estado del pedido padre: ${updateError.message}`
    );
  }
};
