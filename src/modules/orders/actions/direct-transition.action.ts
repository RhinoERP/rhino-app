"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrderNotifications } from "@/modules/notifications/service/notifications.service";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createDraftPurchaseFromChildOrder } from "@/modules/purchases/service/purchases.service";
import type { ChildOrderRoute, OrderFlowStatus } from "../types";

export type DirectTransitionResult = {
  success: boolean;
  error?: string;
};

const ROUTE_TO_STATUS: Record<ChildOrderRoute, OrderFlowStatus> = {
  direct: "PREPARING",
  production: "IN_PRODUCTION",
  purchase: "PURCHASE_REQUIRED",
};

const ROUTE_REVALIDATE: Record<ChildOrderRoute, string> = {
  production: "/produccion",
  purchase: "/compras",
  direct: "/despacho",
};

export async function directTransitionAction(input: {
  orgSlug: string;
  orderId: string;
  quoteItemIds: string[];
  route: ChildOrderRoute;
  observations?: string | null;
}): Promise<DirectTransitionResult> {
  try {
    const { orgSlug, orderId, quoteItemIds, route, observations } = input;
    const newStatus = ROUTE_TO_STATUS[route];

    await guardOrganizationPermissionAccess(orgSlug, "orders.stock_review");
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

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: now } as never)
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
      } as never);
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

    const purchasePromise =
      route === "purchase" && quoteItemIds.length > 0
        ? createDraftPurchaseFromChildOrder({
            orgId: org.id,
            orderId,
            quoteItemIds,
          }).catch((e: unknown) =>
            console.error("Error creating draft purchase order:", e)
          )
        : Promise.resolve();

    await Promise.all([saleSyncPromise, purchasePromise]);

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
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: message };
  }
}
