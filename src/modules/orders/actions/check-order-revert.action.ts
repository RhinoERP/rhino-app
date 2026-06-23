"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ORDER_STATUS_CONFIG } from "../types";

export type CheckOrderRevertResult = {
  canRevert: boolean;
  previousStatus: string | null;
  previousLabel: string | null;
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
      return { canRevert: false, previousStatus: null, previousLabel: null };
    }

    const { data: order } = await supabase
      .from("orders")
      .select("parent_order_id")
      .eq("id", orderId)
      .eq("organization_id", org.id)
      .single();

    if (!order) {
      return { canRevert: false, previousStatus: null, previousLabel: null };
    }

    if (order.parent_order_id === null) {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("parent_order_id", orderId)
        .eq("organization_id", org.id);

      if (count && count > 0) {
        return {
          canRevert: false,
          previousStatus: null,
          previousLabel: null,
          error: "No se puede revertir un pedido padre con hijos activos",
        };
      }
    }

    const { data: latestHistory } = await supabase
      .from("order_status_history")
      .select("from_status")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .single();

    if (!latestHistory?.from_status) {
      return { canRevert: false, previousStatus: null, previousLabel: null };
    }

    const config =
      ORDER_STATUS_CONFIG[
        latestHistory.from_status as keyof typeof ORDER_STATUS_CONFIG
      ];

    return {
      canRevert: true,
      previousStatus: latestHistory.from_status,
      previousLabel: config?.label ?? latestHistory.from_status,
    };
  } catch {
    return { canRevert: false, previousStatus: null, previousLabel: null };
  }
}
