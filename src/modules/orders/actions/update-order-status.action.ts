"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import {
  deductStockForChildItems,
  recalcParentOrderStatus,
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
): Promise<void> {
  if (newStatus !== "PREPARING" && newStatus !== "IN_PRODUCTION") {
    return;
  }
  if (!quoteId) {
    return;
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
  }
}

async function assignOrphanItemsToParent(
  supabase: SupabaseClient<Database>,
  orderId: string,
  quoteId: string
): Promise<void> {
  const { error } = await supabase
    .from("quote_items")
    .update({ assigned_order_id: orderId })
    .eq("quote_id", quoteId)
    .is("assigned_order_id", null);

  if (error) {
    throw new Error(`Error al asignar items al pedido: ${error.message}`);
  }
}

async function persistOrderStatusUpdate(
  supabase: SupabaseClient<Database>,
  params: {
    orderId: string;
    orgId: string;
    newStatus: string;
    previousStatus: string;
    trackingNumber?: string | null;
    notes?: string | null;
    changedBy: string;
  }
): Promise<void> {
  const updatePayload: Record<string, string | null> = {
    status: params.newStatus,
    updated_at: new Date().toISOString(),
  };
  if (params.trackingNumber) {
    updatePayload.tracking_number = params.trackingNumber;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", params.orderId)
    .eq("organization_id", params.orgId);
  if (updateError) {
    throw new Error(`Error al actualizar el pedido: ${updateError.message}`);
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: params.orderId,
      from_status:
        params.previousStatus as Database["public"]["Enums"]["order_flow_status"],
      to_status:
        params.newStatus as Database["public"]["Enums"]["order_flow_status"],
      notes: params.notes ?? null,
      changed_by: params.changedBy,
      changed_at: new Date().toISOString(),
    } as never);
  if (historyError) {
    throw new Error(`Error al registrar el historial: ${historyError.message}`);
  }
}

async function handleDirectPathStockDeduction(params: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  orderId: string;
  quoteId: string;
  newStatus: string;
}): Promise<void> {
  const { supabase, orgId, orderId, quoteId, newStatus } = params;

  if (newStatus !== "PREPARING" && newStatus !== "IN_PRODUCTION") {
    return;
  }

  const { data: assignedItems } = await supabase
    .from("quote_items")
    .select("id")
    .eq("quote_id", quoteId)
    .eq("assigned_order_id", orderId);

  if (!assignedItems?.length) {
    return;
  }

  await deductStockForChildItems(
    supabase,
    orgId,
    assignedItems.map((i) => i.id),
    `Pedido ${orderId} enviado a ruta directa`
  );
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

    await validateStockForTransition(
      supabase,
      org.id,
      newStatus,
      currentOrder.quote_id
    );

    // Si es un pedido padre saliendo de PENDING_STOCK, auto-asignar items sueltos
    // para que recalcParentOrderStatus no los vea como huérfanos
    if (
      !currentOrder.parent_order_id &&
      currentOrder.quote_id &&
      currentOrder.status === "PENDING_STOCK"
    ) {
      await assignOrphanItemsToParent(supabase, orderId, currentOrder.quote_id);
      await handleDirectPathStockDeduction({
        supabase,
        orgId: org.id,
        orderId,
        quoteId: currentOrder.quote_id,
        newStatus,
      });
    }

    if (currentOrder.sales_order_id) {
      await syncSaleStatus(
        supabase,
        currentOrder.sales_order_id,
        org.id,
        newStatus
      );
      revalidatePath(`/org/${orgSlug}/ventas/${currentOrder.sales_order_id}`);
    }

    await persistOrderStatusUpdate(supabase, {
      orderId,
      orgId: org.id,
      newStatus,
      previousStatus,
      trackingNumber,
      notes,
      changedBy: user.id,
    });

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
