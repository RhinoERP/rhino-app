import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";

type OrderChangePayload = {
  orgSlug: string;
  orgId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  isChild?: boolean;
  changedByUserId: string;
  changedByName: string;
};

const STATUS_TO_PERMISSION: Record<string, string> = {
  PENDING_FINANCE: "orders.finance_review",
  FINANCE_REJECTED: "orders.finance_review",
  PENDING_STOCK: "orders.stock_review",
  STOCK_OK: "orders.stock_review",
  STOCK_RESERVED: "orders.stock_review",
  PURCHASE_REQUIRED: "orders.stock_review",
  PURCHASING: "orders.stock_review",
  GOODS_RECEIVED: "orders.stock_review",
  IN_PRODUCTION: "orders.production",
  DESIGN_REVIEW: "orders.production",
  PREPARING: "orders.dispatch",
  DISPATCHED: "orders.dispatch",
  DELIVERED: "orders.dispatch",
};

const STATUS_TO_LINK: Record<string, string> = {
  PENDING_FINANCE: "/finanzas/aprobacion-pedidos",
  FINANCE_REJECTED: "/finanzas/aprobacion-pedidos",
  PENDING_STOCK: "/compras/stock-pedidos",
  STOCK_OK: "/compras/stock-pedidos",
  STOCK_RESERVED: "/compras/stock-pedidos",
  PURCHASE_REQUIRED: "/compras/stock-pedidos",
  PURCHASING: "/compras/stock-pedidos",
  GOODS_RECEIVED: "/compras/stock-pedidos",
  IN_PRODUCTION: "/produccion",
  DESIGN_REVIEW: "/produccion",
  PREPARING: "/despacho",
  DISPATCHED: "/despacho",
  DELIVERED: "/despacho",
};

const STATUS_TO_TITLE: Record<string, string> = {
  PENDING_FINANCE: "Revisión financiera necesaria",
  FINANCE_REJECTED: "Pedido rechazado por finanzas",
  PENDING_STOCK: "Revisión de stock necesaria",
  STOCK_OK: "Stock disponible",
  STOCK_RESERVED: "Stock reservado",
  PURCHASE_REQUIRED: "Requiere compra",
  PURCHASING: "Pedido en compra",
  GOODS_RECEIVED: "Mercadería recibida",
  IN_PRODUCTION: "Pedido en producción",
  DESIGN_REVIEW: "Revisión de diseño",
  PREPARING: "Preparando para despacho",
  DISPATCHED: "Pedido despachado",
  DELIVERED: "Pedido entregado",
};

export async function createOrderNotifications(
  payload: OrderChangePayload
): Promise<void> {
  const permission = STATUS_TO_PERMISSION[payload.status];
  if (!permission) {
    return;
  }

  const supabase = createAdminClient();
  const link = `/org/${payload.orgSlug}${STATUS_TO_LINK[payload.status]}`;
  const title = STATUS_TO_TITLE[payload.status] ?? "Actualización de pedido";
  const prefix = payload.isChild ? "Sub-pedido" : "Pedido";
  const body = `${payload.changedByName} marcó ${prefix.toLowerCase()} ${payload.orderNumber} como "${title}".`;

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: PostgrestError | null }>
  )("notify_users_by_permission", {
    p_org_id: payload.orgId,
    p_permission_key: permission,
    p_type: "order_status_change",
    p_title: title,
    p_body: body,
    p_data: {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      status: payload.status,
      isChild: payload.isChild ?? false,
    },
    p_link: link,
    p_exclude_user_id: payload.changedByUserId,
  });

  if (error) {
    console.error("Error creating notifications:", error);
  }
}

export async function createRevertOrderNotifications(
  payload: OrderChangePayload
): Promise<void> {
  const permission = STATUS_TO_PERMISSION[payload.status];
  if (!permission) {
    return;
  }

  const supabase = createAdminClient();
  const link = `/org/${payload.orgSlug}${STATUS_TO_LINK[payload.status]}`;
  const title = STATUS_TO_TITLE[payload.status] ?? "Actualización de pedido";
  const prefix = payload.isChild ? "Sub-pedido" : "Pedido";
  const body = `${payload.changedByName} revirtió ${prefix.toLowerCase()} ${payload.orderNumber} a "${title}".`;

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: PostgrestError | null }>
  )("notify_users_by_permission", {
    p_org_id: payload.orgId,
    p_permission_key: permission,
    p_type: "order_status_change",
    p_title: title,
    p_body: body,
    p_data: {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      status: payload.status,
      isChild: payload.isChild ?? false,
    },
    p_link: link,
    p_exclude_user_id: payload.changedByUserId,
  });

  if (error) {
    console.error("Error creating revert notifications:", error);
  }
}

export async function createChildOrderNotifications(
  payload: OrderChangePayload & { route: string }
): Promise<void> {
  const route = payload.route;
  let permission: string;
  let link: string;
  let routeLabel: string;
  if (route === "production") {
    permission = "orders.production";
    link = `/org/${payload.orgSlug}/produccion`;
    routeLabel = "producción";
  } else if (route === "purchase") {
    permission = "orders.stock_review";
    link = `/org/${payload.orgSlug}/compras/stock-pedidos`;
    routeLabel = "compra";
  } else {
    permission = "orders.dispatch";
    link = `/org/${payload.orgSlug}/despacho`;
    routeLabel = "despacho";
  }
  const supabase = createAdminClient();

  const title = `Sub-pedido creado para ${routeLabel}`;
  const body = `${payload.changedByName} creó el sub-pedido ${payload.orderNumber} para ${routeLabel}.`;

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: PostgrestError | null }>
  )("notify_users_by_permission", {
    p_org_id: payload.orgId,
    p_permission_key: permission,
    p_type: "child_order_created",
    p_title: title,
    p_body: body,
    p_data: {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      status: payload.status,
      isChild: true,
      route: payload.route,
    },
    p_link: link,
    p_exclude_user_id: payload.changedByUserId,
  });

  if (error) {
    console.error("Error creating child order notifications:", error);
  }
}
