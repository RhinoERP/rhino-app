"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type { StockLotUpdate } from "../service/orders.service";
import {
  deductStockForOrderItems,
  recalcParentOrderStatus,
  rollbackStockDeduction,
  syncSaleStatus,
  validateStockForItems,
} from "../service/orders.service";
import type { ChildOrderRoute, UpdateStatusInput } from "../types";

export type UpdateStatusResult = {
  success: boolean;
  error?: string;
};

async function validateStockForTransition(
  supabase: SupabaseClient<Database>,
  orgId: string,
  newStatus: string,
  quoteId: string | null
): Promise<string[]> {
  if (newStatus !== "PREPARING" && newStatus !== "IN_PRODUCTION") {
    return [];
  }
  if (!quoteId) {
    return [];
  }

  const route: ChildOrderRoute =
    newStatus === "PREPARING" ? "direct" : "production";
  const { data: unassignedItems } = await supabase
    .from("quote_items")
    .select("id")
    .eq("quote_id", quoteId)
    .is("assigned_order_id", null);

  if (unassignedItems && unassignedItems.length > 0) {
    await validateStockForItems(
      supabase,
      orgId,
      unassignedItems.map((i) => i.id),
      route
    );
    return unassignedItems.map((i) => i.id);
  }

  return [];
}

async function deductStockForTransition(
  supabase: SupabaseClient<Database>,
  orgId: string,
  newStatus: string,
  unassignedItemIds: string[]
): Promise<{ lotUpdates: StockLotUpdate[] }> {
  if (unassignedItemIds.length === 0) {
    return { lotUpdates: [] };
  }

  const route: ChildOrderRoute =
    newStatus === "PREPARING" ? "direct" : "production";
  const routeLabel = route === "direct" ? "Despacho" : "Producción";
  const reason = `Transición directa - ${routeLabel}`;
  const deduction = await deductStockForOrderItems(
    supabase,
    orgId,
    unassignedItemIds,
    reason
  );
  return deduction;
}

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
      .select("id, status, quote_id, sales_order_id, parent_order_id")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();
    if (fetchError || !currentOrder) {
      throw new Error("Pedido no encontrado");
    }

    const previousStatus = currentOrder.status;

    const unassignedItemIds = await validateStockForTransition(
      supabase,
      org.id,
      newStatus,
      currentOrder.quote_id
    );

    const deduction = await deductStockForTransition(
      supabase,
      org.id,
      newStatus,
      unassignedItemIds
    );

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
      await rollbackStockDeduction(supabase, org.id, deduction.lotUpdates);
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
