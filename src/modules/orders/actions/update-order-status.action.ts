"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  recalcParentOrderStatus,
  syncSaleStatus,
} from "../service/orders.service";
import type { UpdateStatusInput } from "../types";

export type UpdateStatusResult = {
  success: boolean;
  error?: string;
};

export async function updateOrderStatusAction(
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  try {
    const { orgSlug, orderId, newStatus, notes, trackingNumber } = input;
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      throw new Error("Organización no encontrada");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("No autorizado");
    }

    const { data: currentOrder, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, sales_order_id, parent_order_id")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();
    if (fetchError || !currentOrder) {
      throw new Error("Pedido no encontrado");
    }

    const previousStatus = currentOrder.status;

    if (currentOrder.sales_order_id) {
      await syncSaleStatus(
        supabase,
        currentOrder.sales_order_id,
        org.id,
        newStatus
      );
      revalidatePath(`/org/${orgSlug}/ventas/${currentOrder.sales_order_id}`);
    }

    const updatePayload: Record<string, string | null> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (trackingNumber) {
      updatePayload.tracking_number = trackingNumber;
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .eq("organization_id", org.id);
    if (updateError) {
      throw new Error(`Error al actualizar el pedido: ${updateError.message}`);
    }

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: orderId,
        from_status: previousStatus,
        to_status: newStatus,
        notes: notes ?? null,
        changed_by: user.id,
        changed_at: new Date().toISOString(),
      });
    if (historyError) {
      throw new Error(
        `Error al registrar el historial: ${historyError.message}`
      );
    }

    // Si el order es hijo, recalcular status del padre y sincronizar su venta
    if (currentOrder.parent_order_id) {
      const { salesOrderId: parentSaleId } = await recalcParentOrderStatus(
        currentOrder.parent_order_id,
        org.id
      );
      revalidatePath(`/org/${orgSlug}/pedidos/${currentOrder.parent_order_id}`);
      if (parentSaleId) {
        revalidatePath(`/org/${orgSlug}/ventas/${parentSaleId}`);
      }
    }

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
