"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { confirmIncompleteSaleWithStockDeduction } from "@/modules/sales/service/sales.service";
import type { SalesOrderStatus } from "@/modules/sales/types";
import type { UpdateStatusInput } from "../types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const ORDER_TO_SALE_STATUS: Record<string, SalesOrderStatus> = {
  PENDING_STOCK: "INCOMPLETE",
  DISPATCHED: "DISPATCH",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

async function syncSaleStatus(opts: {
  supabase: SupabaseClient;
  saleId: string;
  orgId: string;
  newStatus: string;
  orgSlug: string;
}) {
  const { supabase, saleId, orgId, newStatus, orgSlug } = opts;
  if (newStatus === "STOCK_OK") {
    await confirmIncompleteSaleWithStockDeduction(supabase, orgId, saleId);
  } else {
    const saleStatus = ORDER_TO_SALE_STATUS[newStatus];
    if (!saleStatus) {
      return;
    }
    const { error } = await supabase
      .from("sales_orders")
      .update({ status: saleStatus, updated_at: new Date().toISOString() })
      .eq("id", saleId)
      .eq("organization_id", orgId);
    if (error) {
      console.error(
        `Error al sincronizar estado de venta ${saleId}: ${error.message}`
      );
    }
  }
  revalidatePath(`/org/${orgSlug}/ventas/${saleId}`);
}

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

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...extraFields,
      })
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

    if (currentOrder.sales_order_id) {
      await syncSaleStatus({
        supabase,
        saleId: currentOrder.sales_order_id,
        orgId: org.id,
        newStatus,
        orgSlug,
      });
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

export type UpdateStatusResult = {
  success: boolean;
  error?: string;
};
