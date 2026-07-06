"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrderNotifications } from "@/modules/notifications/service/notifications.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { SalesOrderStatus } from "@/modules/sales/types";
import {
  recalcParentOrderStatus,
  restoreStockForOrderItems,
} from "../service/orders.service";
import { ORDER_STATUS_CONFIG, type OrderFlowStatus } from "../types";

export type RevertOrderStatusResult = {
  success: boolean;
  previousStatus?: string;
  previousStatusLabel?: string;
  error?: string;
};

async function validateAndFetchOrder(
  orgSlug: string,
  orderId: string,
  notes: string
) {
  if (!notes.trim()) {
    return { error: "La observación es obligatoria" } as const;
  }

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { error: "Organización no encontrada" } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "No autorizado" } as const;
  }

  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select(
      "id, status, parent_order_id, sales_order_id, order_number, quote_id"
    )
    .eq("id", orderId)
    .eq("organization_id", org.id)
    .single();

  if (fetchError || !currentOrder) {
    return { error: "Pedido no encontrado" } as const;
  }

  return { supabase, org, user, currentOrder };
}

async function cancelLinkedPurchaseOrderIfExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
) {
  const { data: order } = await supabase
    .from("orders")
    .select("purchase_order_id")
    .eq("id", orderId)
    .single();

  if (order?.purchase_order_id) {
    await supabase
      .from("purchase_orders")
      .update({ status: "CANCELLED" })
      .eq("id", order.purchase_order_id);
  }
}

async function undoChildCreation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orderId: string;
    orgId: string;
    userId: string;
    orgSlug: string;
    parentOrderId: string | null;
    currentStatus: OrderFlowStatus;
  }
): Promise<RevertOrderStatusResult> {
  const { orderId, orgId, userId, orgSlug, parentOrderId, currentStatus } =
    params;

  // For children in PENDING_STOCK (pending review), just delete and unassign
  if (currentStatus === "PENDING_STOCK") {
    const { error: freeError } = await supabase
      .from("quote_items")
      .update({ assigned_order_id: null })
      .eq("assigned_order_id", orderId);

    if (freeError) {
      return {
        success: false,
        error: `Error al liberar items: ${freeError.message}`,
      };
    }

    const { error: deleteError } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId)
      .eq("organization_id", orgId);

    if (deleteError) {
      return {
        success: false,
        error: `Error al eliminar borrador: ${deleteError.message}`,
      };
    }

    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
    if (parentOrderId) {
      revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);
    }

    return { success: true, previousStatusLabel: "Borrador eliminado" };
  }

  // For fully-created children, do full revert (restore stock, cancel, etc.)
  await cancelLinkedPurchaseOrderIfExists(supabase, orderId);

  const { data: assignedItems } = await supabase
    .from("quote_items")
    .select("id")
    .eq("assigned_order_id", orderId);

  const assignedItemIds = assignedItems?.map((i) => i.id) ?? [];

  if (assignedItemIds.length > 0) {
    const { data: childOrder } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .single();

    const orderLabel = childOrder?.order_number ?? orderId;
    await restoreStockForOrderItems(
      supabase,
      orgId,
      assignedItemIds,
      `Reversión de sub-pedido ${orderLabel}`
    );
  }

  const { error: unassignError } = await supabase
    .from("quote_items")
    .update({ assigned_order_id: null })
    .eq("assigned_order_id", orderId);

  if (unassignError) {
    return {
      success: false,
      error: `Error al liberar items: ${unassignError.message}`,
    };
  }

  const { error: cancelError } = await supabase
    .from("orders")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId);

  if (cancelError) {
    return {
      success: false,
      error: `Error al cancelar sub-pedido: ${cancelError.message}`,
    };
  }

  const { error: insertError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: "CANCELLED",
      notes: "Sub-pedido cancelado - items devueltos al pool de stock",
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (insertError) {
    return {
      success: false,
      error: `Error al registrar historial: ${insertError.message}`,
    };
  }

  if (parentOrderId) {
    await recalcParentOrderStatus(parentOrderId, orgId);
    revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);
  }

  revalidateOrderPaths(orgSlug, orderId);

  return { success: true, previousStatusLabel: "Cancelado" };
}

function revalidateOrderPaths(orgSlug: string, orderId: string) {
  revalidatePath(`/org/${orgSlug}/pedidos`);
  revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
  revalidatePath(`/org/${orgSlug}/produccion`);
  revalidatePath(`/org/${orgSlug}/despacho`);
  revalidatePath(`/org/${orgSlug}/finanzas/aprobacion-pedidos`);
  revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
}

async function checkNoChildren(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  orgId: string
) {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("parent_order_id", orderId)
    .eq("organization_id", orgId);

  if (count && count > 0) {
    return { error: "No se puede revertir un pedido padre con hijos activos" };
  }
  return {};
}

async function cancelAllChildrenAndRestoreStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    children: { id: string }[];
    orgId: string;
    userId: string;
    currentStatus: OrderFlowStatus;
  }
): Promise<{ error?: string }> {
  const { children, orgId, userId, currentStatus } = params;
  const childIds = children.map((c) => c.id);

  const { data: allAssignedItems } = await supabase
    .from("quote_items")
    .select("id")
    .in("assigned_order_id", childIds);

  const assignedItemIds = allAssignedItems?.map((i) => i.id) ?? [];

  if (assignedItemIds.length > 0) {
    await restoreStockForOrderItems(
      supabase,
      orgId,
      assignedItemIds,
      "Reversión de pedido padre - stock restaurado"
    );
  }

  const { error: unassignError } = await supabase
    .from("quote_items")
    .update({ assigned_order_id: null })
    .in("assigned_order_id", childIds);

  if (unassignError) {
    return {
      error: `Error al liberar items de hijos: ${unassignError.message}`,
    };
  }

  for (const childId of childIds) {
    await cancelLinkedPurchaseOrderIfExists(supabase, childId);
  }

  const { error: cancelError } = await supabase
    .from("orders")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .in("id", childIds)
    .eq("organization_id", orgId);

  if (cancelError) {
    return { error: `Error al cancelar sub-pedidos: ${cancelError.message}` };
  }

  const now = new Date().toISOString();
  const historyRows = childIds.map((childId) => ({
    order_id: childId,
    from_status: currentStatus as OrderFlowStatus,
    to_status: "CANCELLED" as OrderFlowStatus,
    notes: "Sub-pedido cancelado por reversión del pedido padre",
    changed_by: userId,
    changed_at: now,
  }));

  const { error: insertError } = await supabase
    .from("order_status_history")
    .insert(historyRows);

  if (insertError) {
    return {
      error: `Error al registrar historial de hijos: ${insertError.message}`,
    };
  }

  return {};
}

async function cascadeRevertParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orgSlug: string;
    orderId: string;
    notes: string;
    userId: string;
    orgId: string;
    currentStatus: OrderFlowStatus;
    salesOrderId: string | null;
  }
): Promise<RevertOrderStatusResult> {
  const {
    orgSlug,
    orderId,
    notes,
    userId,
    orgId,
    currentStatus,
    salesOrderId,
  } = params;

  const { data: children } = await supabase
    .from("orders")
    .select("id")
    .eq("parent_order_id", orderId)
    .eq("organization_id", orgId);

  if (children && children.length > 0) {
    const cancelResult = await cancelAllChildrenAndRestoreStock(supabase, {
      children,
      orgId,
      userId,
      currentStatus,
    });
    if (cancelResult.error) {
      return { success: false, error: cancelResult.error };
    }
  }

  const { data: latestHistory } = await supabase
    .from("order_status_history")
    .select("from_status")
    .eq("order_id", orderId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .single();

  const previousStatus = latestHistory?.from_status ?? "PENDING_FINANCE";

  const { error: parentUpdateError } = await supabase
    .from("orders")
    .update({
      status: previousStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId);

  if (parentUpdateError) {
    return {
      success: false,
      error: `Error al revertir pedido padre: ${parentUpdateError.message}`,
    };
  }

  const { error: parentHistoryError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: previousStatus,
      notes: notes.trim(),
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (parentHistoryError) {
    return {
      success: false,
      error: `Error al registrar historial: ${parentHistoryError.message}`,
    };
  }

  if (salesOrderId) {
    await revertSaleStatus(supabase, salesOrderId, orgId, previousStatus);
    revalidatePath(`/org/${orgSlug}/ventas/${salesOrderId}`);
  }

  revalidateOrderPaths(orgSlug, orderId);

  const config =
    ORDER_STATUS_CONFIG[previousStatus as keyof typeof ORDER_STATUS_CONFIG];

  return {
    success: true,
    previousStatus,
    previousStatusLabel: config?.label ?? previousStatus,
  };
}

async function revertSaleStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleId: string,
  orgId: string,
  orderStatus: string
) {
  const ORDER_TO_SALE_REVERT: Record<string, SalesOrderStatus> = {
    PENDING_FINANCE: "DRAFT",
    FINANCE_REJECTED: "DRAFT",
    PENDING_STOCK: "INCOMPLETE",
    STOCK_OK: "CONFIRMED",
    PURCHASE_REQUIRED: "CONFIRMED",
    PURCHASING: "CONFIRMED",
    GOODS_RECEIVED: "CONFIRMED",
    IN_PRODUCTION: "CONFIRMED",
    DESIGN_REVIEW: "CONFIRMED",
    PREPARING: "CONFIRMED",
    DISPATCHED: "DISPATCH",
    DELIVERED: "DELIVERED",
  };

  const saleStatus = ORDER_TO_SALE_REVERT[orderStatus];
  if (!saleStatus) {
    return;
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({ status: saleStatus, updated_at: new Date().toISOString() })
    .eq("id", saleId)
    .eq("organization_id", orgId);

  if (error) {
    throw new Error(`Error al revertir estado de venta: ${error.message}`);
  }
}

async function applyNormalRevert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orgSlug: string;
    orderId: string;
    notes: string;
    userId: string;
    orgId: string;
    currentStatus: OrderFlowStatus;
    parentOrderId: string | null;
    salesOrderId: string | null;
  }
): Promise<RevertOrderStatusResult> {
  const {
    orgSlug,
    orderId,
    notes,
    userId,
    orgId,
    currentStatus,
    parentOrderId,
    salesOrderId,
  } = params;

  if (parentOrderId === null) {
    const childCheck = await checkNoChildren(supabase, orderId, orgId);
    if ("error" in childCheck) {
      return { success: false, error: childCheck.error };
    }
  }

  const { data: latestHistory, error: historyError } = await supabase
    .from("order_status_history")
    .select("from_status")
    .eq("order_id", orderId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .single();

  if (historyError || !latestHistory?.from_status) {
    return {
      success: false,
      error: "El pedido no tiene un estado anterior al cual volver",
    };
  }

  const previousStatus = latestHistory.from_status;

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: previousStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId);

  if (updateError) {
    return {
      success: false,
      error: `Error al revertir: ${updateError.message}`,
    };
  }

  const { error: insertError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: previousStatus,
      notes: notes.trim(),
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

  if (insertError) {
    return {
      success: false,
      error: `Error al registrar historial: ${insertError.message}`,
    };
  }

  if (salesOrderId && !parentOrderId) {
    await revertSaleStatus(supabase, salesOrderId, orgId, previousStatus);
    revalidatePath(`/org/${orgSlug}/ventas/${salesOrderId}`);
  }

  if (parentOrderId) {
    await recalcParentOrderStatus(parentOrderId, orgId);
    revalidatePath(`/org/${orgSlug}/pedidos/${parentOrderId}`);
  }

  revalidateOrderPaths(orgSlug, orderId);

  const config =
    ORDER_STATUS_CONFIG[previousStatus as keyof typeof ORDER_STATUS_CONFIG];

  return {
    success: true,
    previousStatus,
    previousStatusLabel: config?.label ?? previousStatus,
  };
}

export async function revertOrderStatusAction(
  orgSlug: string,
  orderId: string,
  notes: string,
  revertType: "normal" | "undo_creation" | "cascade_revert" = "normal"
): Promise<RevertOrderStatusResult> {
  try {
    const permissionByStatus: Record<string, string> = {
      PENDING_FINANCE: "orders.finance_review",
      PENDING_STOCK: "orders.stock_review",
      STOCK_OK: "orders.stock_review",
      PURCHASE_REQUIRED: "orders.stock_review",
      PURCHASING: "orders.stock_review",
      GOODS_RECEIVED: "orders.stock_review",
      IN_PRODUCTION: "orders.production",
      DESIGN_REVIEW: "orders.production",
      PREPARING: "orders.dispatch",
      DISPATCHED: "orders.dispatch",
      DELIVERED: "orders.dispatch",
    };

    // For undo_creation, we don't know the child's status yet — require base read
    if (revertType !== "undo_creation") {
      const supabasePerm = await createClient();
      const { data: orderForPerm } = await supabasePerm
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .single();
      const currentStatus = orderForPerm?.status as string | undefined;
      const perm = permissionByStatus[currentStatus ?? ""] ?? "orders.read";
      await guardOrganizationPermissionAccess(orgSlug, perm);
    } else {
      await guardOrganizationPermissionAccess(orgSlug, "orders.read");
    }

    const validation = await validateAndFetchOrder(orgSlug, orderId, notes);
    if ("error" in validation) {
      return { success: false, error: validation.error };
    }

    const { supabase, org, user, currentOrder } = validation;
    const currentStatus = currentOrder.status as OrderFlowStatus;

    if (currentStatus === "GOODS_RECEIVED") {
      return {
        success: false,
        error:
          "No se puede revertir un pedido en mercadería recibida. Debe confirmar stock primero.",
      };
    }

    const changedByName =
      (user.user_metadata?.full_name as string | undefined) ??
      user.email ??
      "Usuario";

    let result: RevertOrderStatusResult;

    if (revertType === "undo_creation") {
      result = await undoChildCreation(supabase, {
        orderId,
        orgId: org.id,
        userId: user.id,
        orgSlug,
        parentOrderId: currentOrder.parent_order_id,
        currentStatus,
      });
      return result;
    }

    if (revertType === "cascade_revert") {
      result = await cascadeRevertParent(supabase, {
        orgSlug,
        orderId,
        notes,
        userId: user.id,
        orgId: org.id,
        currentStatus,
        salesOrderId: currentOrder.sales_order_id,
      });
    } else {
      result = await applyNormalRevert(supabase, {
        orgSlug,
        orderId,
        notes,
        userId: user.id,
        orgId: org.id,
        currentStatus,
        parentOrderId: currentOrder.parent_order_id,
        salesOrderId: currentOrder.sales_order_id,
      });
    }

    if (result.success && result.previousStatus) {
      createOrderNotifications({
        orgSlug,
        orgId: org.id,
        orderId,
        orderNumber: currentOrder.order_number,
        status: result.previousStatus,
        changedByUserId: user.id,
        changedByName,
        isChild: !!currentOrder.parent_order_id,
      }).catch(console.error);
    }

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al revertir";
    return { success: false, error: message };
  }
}
