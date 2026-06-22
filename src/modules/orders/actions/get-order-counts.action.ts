"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrderCounts } from "@/modules/orders/service/orders.service";
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

  return getOrderCounts(orgSlug);
}
