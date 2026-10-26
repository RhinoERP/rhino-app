"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrderNotifications } from "@/modules/notifications/service/notifications.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { createDraftPurchaseFromChildOrder } from "@/modules/purchases/service/create-purchase-draft.service";
import {
  groupQuoteItemsBySupplier,
  rollbackStockDeduction,
  type StockLotUpdate,
  syncSaleStatus,
  validateStockForItems,
} from "../service/orders.service";
import type { ChildOrderRoute, OrderFlowStatus } from "../types";

export type DirectTransitionResult = {
  success: boolean;
  error?: string;
};

const ROUTE_TO_STATUS: Record<ChildOrderRoute, OrderFlowStatus> = {
  direct: "PREPARING",
  production: "IN_PRODUCTION",
  purchase: "PURCHASE_REQUIRED",
  reserve: "STOCK_RESERVED",
};

const ROUTE_REVALIDATE: Record<ChildOrderRoute, string> = {
  production: "/produccion",
  purchase: "/compras",
  direct: "/despacho",
  reserve: "/compras/stock-pedidos",
};

async function maybeDeductStockForDirectTransition(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  route: ChildOrderRoute;
  orderNumber: string;
  quoteItemIds: string[];
}): Promise<StockLotUpdate[]> {
  if (params.route !== "direct" && params.route !== "production") {
    return [];
  }

  await validateStockForItems({
    supabase: params.supabase,
    orgId: params.orgId,
    quoteItemIds: params.quoteItemIds,
    route: params.route,
  });

  // Availability is checked here, but the operational sale remains the sole
  // stock-moving event.
  return [];
}

async function handleRollbackStockDeduction(
  orgSlug: string,
  lotUpdates: StockLotUpdate[]
): Promise<void> {
  if (lotUpdates.length === 0) {
    return;
  }

  try {
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);
    if (org?.id) {
      await rollbackStockDeduction(supabase, org.id, lotUpdates);
    }
  } catch {
    // best-effort rollback
  }
}

async function syncPurchaseDrafts(
  orgId: string,
  orderId: string,
  route: ChildOrderRoute,
  quoteItemIds: string[]
): Promise<void> {
  if (route !== "purchase" || quoteItemIds.length === 0) {
    return;
  }

  const groups = await groupQuoteItemsBySupplier(quoteItemIds);

  // Serial: one draft per supplier group, generating the purchase number
  // sequentially so concurrent groups never collide. Errors are propagated
  // so a failed draft never drops items silently.
  for (const itemIds of groups.values()) {
    await createDraftPurchaseFromChildOrder({
      orgId,
      orderId,
      quoteItemIds: itemIds,
    });
  }
}

async function hasLinkedDraftPurchase(orderId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("purchase_order_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order?.purchase_order_id) {
    return false;
  }

  const { data: draft } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("id", order.purchase_order_id)
    .eq("status", "DRAFT")
    .maybeSingle();

  return Boolean(draft);
}

async function assertDirectTransitionRouteAllowed(
  route: ChildOrderRoute,
  quoteItemIds: string[]
): Promise<void> {
  if (route === "reserve") {
    throw new Error(
      "La ruta Reserva solo se puede crear como sub-pedido, no como transición directa del pedido padre"
    );
  }

  if (route === "purchase") {
    const supplierGroups = await groupQuoteItemsBySupplier(quoteItemIds);
    if (supplierGroups.size > 1) {
      throw new Error(
        "Hay items de varios proveedores: usá 'Enviar a Compra' para crear sub-pedidos de compra separados"
      );
    }
  }
}

function shouldSkipDirectTransition(params: {
  currentStatus: OrderFlowStatus;
  newStatus: OrderFlowStatus;
  route: ChildOrderRoute;
  orderId: string;
}): Promise<boolean> {
  if (params.currentStatus !== params.newStatus) {
    return Promise.resolve(false);
  }

  if (params.route !== "purchase") {
    return Promise.resolve(true);
  }

  // Re-submit: skip only if the draft already exists. If a previous attempt
  // updated the status but failed to create the draft, proceed to create it.
  return hasLinkedDraftPurchase(params.orderId);
}

async function recordDirectTransitionHistory(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orderId: string;
  fromStatus: OrderFlowStatus;
  toStatus: OrderFlowStatus;
  observations?: string | null;
  changedBy: string;
  changedAt: string;
}): Promise<void> {
  const { error: historyError } = await params.supabase
    .from("order_status_history")
    .insert({
      order_id: params.orderId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      notes:
        params.observations?.trim() ??
        "Transición directa desde revisión de stock",
      changed_by: params.changedBy,
      changed_at: params.changedAt,
    });

  if (historyError) {
    throw new Error(`Error al registrar historial: ${historyError.message}`);
  }
}

function revalidateDirectTransitionPaths(
  orgSlug: string,
  orderId: string,
  route: ChildOrderRoute
): void {
  revalidatePath(`/org/${orgSlug}/pedidos`);
  revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
  revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
  const revalidateSuffix = ROUTE_REVALIDATE[route];
  if (revalidateSuffix) {
    revalidatePath(`/org/${orgSlug}${revalidateSuffix}`);
  }
}

export async function directTransitionAction(input: {
  orgSlug: string;
  orderId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
  observations?: string | null;
}): Promise<DirectTransitionResult> {
  const { orgSlug, orderId, quoteItemIds, route, observations } = input;
  let deductionLotUpdates: StockLotUpdate[] = [];

  await ensure("orders.stock_review", input.orgSlug);
  try {
    await assertDirectTransitionRouteAllowed(route, quoteItemIds);

    const newStatus = ROUTE_TO_STATUS[route];

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

    const { data: currentOrder } = await supabase
      .from("orders")
      .select("status, order_number, sales_order_id")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();
    if (!currentOrder) {
      throw new Error("Pedido no encontrado");
    }

    const alreadyInTargetStatus = currentOrder.status === newStatus;

    const shouldSkip = await shouldSkipDirectTransition({
      currentStatus: currentOrder.status,
      newStatus,
      route,
      orderId,
    });

    if (shouldSkip) {
      return { success: true };
    }

    deductionLotUpdates = await maybeDeductStockForDirectTransition({
      supabase,
      orgId: org.id,
      route,
      orderNumber: currentOrder.order_number,
      quoteItemIds,
    });

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: now })
      .eq("id", orderId)
      .eq("organization_id", org.id);
    if (updateError) {
      throw new Error(`Error al actualizar pedido: ${updateError.message}`);
    }

    if (!alreadyInTargetStatus) {
      await recordDirectTransitionHistory({
        supabase,
        orderId,
        fromStatus: currentOrder.status,
        toStatus: newStatus,
        observations,
        changedBy: user.id,
        changedAt: now,
      });
    }

    const saleSyncPromise = currentOrder.sales_order_id
      ? syncSaleStatus(
          supabase,
          currentOrder.sales_order_id,
          org.id,
          newStatus
        ).catch((e: unknown) => console.error("Error syncing sale status:", e))
      : Promise.resolve();

    await Promise.all([
      saleSyncPromise,
      syncPurchaseDrafts(org.id, orderId, route, quoteItemIds),
    ]);

    if (!alreadyInTargetStatus) {
      createOrderNotifications({
        orgSlug,
        orgId: org.id,
        orderId,
        orderNumber: currentOrder.order_number,
        status: newStatus,
        changedByUserId: user.id,
        changedByName: user.email ?? "Usuario",
      }).catch(console.error);
    }

    revalidateDirectTransitionPaths(orgSlug, orderId, route);

    return { success: true };
  } catch (error) {
    await handleRollbackStockDeduction(orgSlug, deductionLotUpdates);

    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
