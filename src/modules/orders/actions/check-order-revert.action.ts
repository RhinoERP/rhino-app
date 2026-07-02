"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ORDER_STATUS_CONFIG } from "../types";

export type RevertType = "normal" | "undo_creation" | "cascade_revert";

export type CheckOrderRevertResult = {
  canRevert: boolean;
  previousStatus: string | null;
  previousLabel: string | null;
  revertType: RevertType;
  childCount?: number;
  error?: string;
};

export async function checkOrderRevertAction(
  orgSlug: string,
  orderId: string
): Promise<CheckOrderRevertResult> {
  try {
    const supabase = await createClient();
    const org = await getOrganizationBySlug(orgSlug);
    if (!org?.id) {
      return {
        canRevert: false,
        previousStatus: null,
        previousLabel: null,
        revertType: "normal",
      };
    }

    const { data: order } = await supabase
      .from("orders")
      .select("parent_order_id, status")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();

    if (!order) {
      return {
        canRevert: false,
        previousStatus: null,
        previousLabel: null,
        revertType: "normal",
      };
    }

    if (order.status === "GOODS_RECEIVED") {
      return {
        canRevert: false,
        previousStatus: null,
        previousLabel: null,
        revertType: "normal",
        error: "No se puede revertir un pedido en mercadería recibida",
      };
    }

    const isChild = order.parent_order_id !== null;

    // Children always revert via undo_creation (cancel child, restore stock)
    if (isChild) {
      const config =
        ORDER_STATUS_CONFIG[order.status as keyof typeof ORDER_STATUS_CONFIG];
      return {
        canRevert: true,
        previousStatus: order.status,
        previousLabel: config?.label ?? order.status,
        revertType: "undo_creation",
      };
    }

    // Parent — check if it has children (cascade revert needed)
    const { count: childCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("parent_order_id", orderId)
      .eq("organization_id", org.id)
      .single();

    if ((childCount ?? 0) > 0) {
      return {
        canRevert: true,
        previousStatus: null,
        previousLabel: null,
        revertType: "cascade_revert",
        childCount: childCount ?? 0,
      };
    }

    const { data: latestHistory } = await supabase
      .from("order_status_history")
      .select("from_status")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .single();

    if (!latestHistory?.from_status) {
      return {
        canRevert: false,
        previousStatus: null,
        previousLabel: null,
        revertType: "normal",
      };
    }

    const config =
      ORDER_STATUS_CONFIG[
        latestHistory.from_status as keyof typeof ORDER_STATUS_CONFIG
      ];

    return {
      canRevert: true,
      previousStatus: latestHistory.from_status,
      previousLabel: config?.label ?? latestHistory.from_status,
      revertType: "normal",
    };
  } catch {
    return {
      canRevert: false,
      previousStatus: null,
      previousLabel: null,
      revertType: "normal",
    };
  }
}
