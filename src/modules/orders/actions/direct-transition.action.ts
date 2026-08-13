"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrderNotifications } from "@/modules/notifications/service/notifications.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { createDraftPurchaseFromChildOrder } from "@/modules/purchases/service/create-purchase-draft.service";
import {
  deductStockForOrderItems,
  findAlreadyDeductedItemIds,
  groupQuoteItemsBySupplier,
  rollbackStockDeduction,
  type StockLotUpdate,
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

  const alreadyDeductedIds = await findAlreadyDeductedItemIds(
    params.supabase,
    params.quoteItemIds
  );

  const stockActionIds = params.quoteItemIds.filter(
    (id) => !alreadyDeductedIds.has(id)
  );

  await validateStockForItems({
    supabase: params.supabase,
    orgId: params.orgId,
    quoteItemIds: stockActionIds,
    route: params.route,
  });

  const routeLabel = params.route === "direct" ? "Despacho" : "Producción";
  const deduction = await deductStockForOrderItems({
    supabase: params.supabase,
    orgId: params.orgId,
    quoteItemIds: stockActionIds,
    movementReason: `Pedido ${params.orderNumber} - Transición directa (${routeLabel})`,
  });

  return deduction.lotUpdates;
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
  const promises = [...groups.values()].map((itemIds) =>
    createDraftPurchaseFromChildOrder({
      orgId,
      orderId,
      quoteItemIds: itemIds,
    }).catch((e: unknown) =>
      console.error("Error creating draft purchase order:", e)
    )
  );
  await Promise.all(promises);
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
    if (route === "reserve") {
      throw new Error(
        "La ruta Reserva solo se puede crear como sub-pedido, no como transición directa del pedido padre"
      );
    }

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

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert({
        order_id: orderId,
        from_status: currentOrder.status,
        to_status: newStatus,
        notes:
          observations?.trim() ?? "Transición directa desde revisión de stock",
        changed_by: user.id,
        changed_at: now,
      });
    if (historyError) {
      throw new Error(`Error al registrar historial: ${historyError.message}`);
    }

    const saleSyncPromise = currentOrder.sales_order_id
      ? supabase
          .from("sales_orders")
          .update({ status: "CONFIRMED", updated_at: now })
          .eq("id", currentOrder.sales_order_id)
          .eq("organization_id", org.id)
          .then(
            ({ error: e }) =>
              e && console.error("Error syncing sale status:", e)
          )
      : Promise.resolve();

    await Promise.all([
      saleSyncPromise,
      syncPurchaseDrafts(org.id, orderId, route, quoteItemIds),
    ]);

    createOrderNotifications({
      orgSlug,
      orgId: org.id,
      orderId,
      orderNumber: currentOrder.order_number,
      status: newStatus,
      changedByUserId: user.id,
      changedByName: user.email ?? "Usuario",
    }).catch(console.error);

    revalidatePath(`/org/${orgSlug}/pedidos`);
    revalidatePath(`/org/${orgSlug}/compras/stock-pedidos`);
    revalidatePath(`/org/${orgSlug}/pedidos/${orderId}`);
    const revalidateSuffix = ROUTE_REVALIDATE[route];
    if (revalidateSuffix) {
      revalidatePath(`/org/${orgSlug}${revalidateSuffix}`);
    }

    return { success: true };
  } catch (error) {
    await handleRollbackStockDeduction(orgSlug, deductionLotUpdates);

    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
