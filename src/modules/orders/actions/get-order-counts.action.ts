"use server";

import { createClient } from "@/lib/supabase/server";
import { computeOrderAreaCounts } from "@/modules/orders/service/orders.service";
import type { OrderAreaCounts } from "../types";

export async function getOrderCountsAction(
  orgSlug: string
): Promise<OrderAreaCounts> {
  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgError || !org) {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, status, parent_order_id")
    .eq("organization_id", org.id)
    .not("status", "in", '("DELIVERED","CANCELLED","FINANCE_REJECTED")');

  if (error || !data) {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }

  const { data: allChildren } = await supabase
    .from("orders")
    .select("parent_order_id")
    .not("parent_order_id", "is", null);

  const parentIdsWithChildren = new Set(
    (allChildren ?? [])
      .map((o) => o.parent_order_id)
      .filter(Boolean) as string[]
  );

  return computeOrderAreaCounts(data, parentIdsWithChildren);
}
