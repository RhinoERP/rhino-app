"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { OrderFlowStatus } from "../types";
import { ORDER_STATUS_CONFIG } from "../types";

export type CheckOrderCancelResult = {
  canCancel: boolean;
  error?: string;
  orderStatus?: OrderFlowStatus;
  orderLabel?: string;
  type?: "single" | "child" | "parent";
  childCount?: number;
};

const NON_CANCELLABLE_STATUSES: OrderFlowStatus[] = [
  "DELIVERED",
  "CANCELLED",
  "FINANCE_REJECTED",
  "DISPATCHED",
];

export async function checkOrderCancelAction(
  orgSlug: string,
  orderId: string
): Promise<CheckOrderCancelResult> {
  try {
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return { canCancel: false, error: "Organización no encontrada" };
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, status, parent_order_id")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();

    if (!order) {
      return { canCancel: false, error: "Pedido no encontrado" };
    }

    const status = order.status as OrderFlowStatus;
    const config =
      ORDER_STATUS_CONFIG[status as keyof typeof ORDER_STATUS_CONFIG];

    if (NON_CANCELLABLE_STATUSES.includes(status)) {
      return {
        canCancel: false,
        error: `No se puede cancelar un pedido en estado ${config?.label ?? status}`,
        orderStatus: status,
        orderLabel: config?.label,
      };
    }

    const isChild = order.parent_order_id !== null;

    if (isChild) {
      return {
        canCancel: true,
        orderStatus: status,
        orderLabel: config?.label,
        type: "child",
      };
    }

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("parent_order_id", orderId)
      .eq("organization_id", org.id);

    if (count && count > 0) {
      return {
        canCancel: true,
        orderStatus: status,
        orderLabel: config?.label,
        type: "parent",
        childCount: count,
      };
    }

    return {
      canCancel: true,
      orderStatus: status,
      orderLabel: config?.label,
      type: "single",
    };
  } catch {
    return { canCancel: false, error: "Error al verificar pedido" };
  }
}
