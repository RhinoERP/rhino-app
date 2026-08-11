"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrderNotifications } from "@/modules/notifications/service/notifications.service";
import {
  getOrganizationBySlug,
  getOrganizationLayoutData,
} from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
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
    await validateStockForItems({
      supabase,
      orgId,
      quoteItemIds: unassignedItems.map((i) => i.id),
      route,
    });
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
  const deduction = await deductStockForOrderItems({
    supabase,
    orgId,
    quoteItemIds: unassignedItemIds,
    movementReason: reason,
  });
  return deduction;
}

function revalidateOrderPaths(
  orgSlug: string,
  orderId: string,
  parentOrderId: string | null,
  salesOrderId: string | null
) {
  revalidatePath(`/org/${orgSlug}/pedidos`);
  revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
  if (parentOrderId) {
    revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);
  }
  if (salesOrderId) {
    revalidatePath(`/org/${orgSlug}/ventas/${salesOrderId}`);
  }
}

async function updateOrderAndHistory(
  supabase: SupabaseClient<Database>,
  params: {
    orderId: string;
    orgId: string;
    newStatus: Database["public"]["Enums"]["order_flow_status"];
    previousStatus: Database["public"]["Enums"]["order_flow_status"];
    notes?: string;
    trackingNumber?: string;
    observations?: string | null;
    userId: string;
    deduction: Awaited<ReturnType<typeof deductStockForTransition>>;
  }
) {
  const updatePayload: Record<string, string | null> = {
    status: params.newStatus,
    updated_at: new Date().toISOString(),
  };
  if (params.trackingNumber) {
    updatePayload.tracking_number = params.trackingNumber;
  }
  if (params.observations !== undefined) {
    updatePayload.observations = params.observations;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", params.orderId)
    .eq("organization_id", params.orgId);
  if (updateError) {
    await rollbackStockDeduction(
      supabase,
      params.orgId,
      params.deduction.lotUpdates
    );
    throw new Error(`Error al actualizar el pedido: ${updateError.message}`);
  }

  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: params.orderId,
      from_status: params.previousStatus,
      to_status: params.newStatus,
      notes: params.notes ?? null,
      changed_by: params.userId,
      changed_at: new Date().toISOString(),
    });
  if (historyError) {
    throw new Error(`Error al registrar el historial: ${historyError.message}`);
  }
}

async function checkActionPermission(
  orgSlug: string,
  newStatus: string
): Promise<void> {
  const permissionByStatus: Record<string, string | string[]> = {
    PREPARING: ["orders.stock_review", "orders.dispatch", "orders.production"],
    PENDING_STOCK: "orders.finance_review",
    FINANCE_REJECTED: "orders.finance_review",
    DESIGN_REVIEW: ["orders.production", "orders.stock_review"],
    DELIVERED: ["orders.dispatch", "orders.stock_review"],
  };
  const raw = permissionByStatus[newStatus] ?? "orders.read";
  const requiredPerms = Array.isArray(raw) ? raw : [raw];
  const layoutData = await getOrganizationLayoutData(orgSlug);
  if (!layoutData) {
    throw new Error("No se pudo verificar permisos");
  }
  // Admin has access to everything
  if (layoutData.permissions.includes("organization.admin")) {
    return;
  }
  if (!requiredPerms.some((p) => layoutData.permissions.includes(p))) {
    throw new Error(
      `Permiso requerido: ${requiredPerms.join(" | ")}, tus permisos: ${layoutData.permissions.join(", ")}`
    );
  }
}

export async function updateOrderStatusAction(
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  await ensure("orders.manage", input.orgSlug);
  try {
    const { orgSlug, orderId, newStatus, notes, trackingNumber, observations } =
      input;

    await checkActionPermission(orgSlug, newStatus);

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
      .select(
        "id, status, quote_id, sales_order_id, parent_order_id, order_number"
      )
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();
    if (fetchError || !currentOrder) {
      throw new Error("Pedido no encontrado");
    }

    const previousStatus = currentOrder.status;

    const isChildOrder = !!currentOrder.parent_order_id;

    const unassignedItemIds = isChildOrder
      ? []
      : await validateStockForTransition(
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
    }

    await updateOrderAndHistory(supabase, {
      orderId,
      orgId: org.id,
      newStatus,
      previousStatus,
      notes,
      trackingNumber,
      observations,
      userId: user.id,
      deduction,
    });

    if (currentOrder.parent_order_id) {
      const { salesOrderId: parentSaleId } = await recalcParentOrderStatus(
        currentOrder.parent_order_id,
        org.id
      );
      revalidateOrderPaths(
        orgSlug,
        orderId,
        currentOrder.parent_order_id,
        parentSaleId ?? null
      );
    } else {
      revalidateOrderPaths(orgSlug, orderId, null, currentOrder.sales_order_id);
    }

    const changedByName =
      (user.user_metadata?.full_name as string | undefined) ??
      user.email ??
      "Usuario";

    createOrderNotifications({
      orgSlug,
      orgId: org.id,
      orderId,
      orderNumber: currentOrder.order_number,
      status: newStatus,
      changedByUserId: user.id,
      changedByName,
    }).catch(console.error);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
