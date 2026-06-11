"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { SalesOrderStatus } from "@/modules/sales/types";
import type { UpdateStatusInput } from "../types";

export type UpdateStatusResult = {
  success: boolean;
  error?: string;
};

const ORDER_TO_SALE_STATUS: Record<string, SalesOrderStatus> = {
  PENDING_STOCK: "INCOMPLETE",
  STOCK_OK: "CONFIRMED",
  DISPATCHED: "DISPATCH",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

export async function updateOrderStatusAction(
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  try {
    const { orgSlug, orderId, newStatus, notes, extraFields } = input;
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
      .select("id, status, sales_order_id")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();

    if (fetchError || !currentOrder) {
      throw new Error("Pedido no encontrado");
    }

    const previousStatus = currentOrder.status;

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...extraFields,
    };

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

    const saleStatus = ORDER_TO_SALE_STATUS[newStatus];
    if (saleStatus && currentOrder.sales_order_id) {
      const { error: saleError } = await supabase
        .from("sales_orders")
        .update({
          status: saleStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentOrder.sales_order_id)
        .eq("organization_id", org.id);

      if (saleError) {
        console.error(
          `Error al sincronizar estado de venta ${currentOrder.sales_order_id}: ${saleError.message}`
        );
      }
    }

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);

    if (currentOrder.sales_order_id) {
      revalidatePath(`/org/${orgSlug}/ventas/${currentOrder.sales_order_id}`);
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
