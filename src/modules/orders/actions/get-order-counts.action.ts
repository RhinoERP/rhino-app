"use server";

import { createClient } from "@/lib/supabase/server";
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
    .select("status")
    .eq("organization_id", org.id)
    .not("status", "in", '("DELIVERED","CANCELLED","FINANCE_REJECTED")');

  if (error || !data) {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }

  const finance = data.filter((o) => o.status === "PENDING_FINANCE").length;
  const stock = data.filter((o) =>
    [
      "PENDING_STOCK",
      "STOCK_OK",
      "PURCHASE_REQUIRED",
      "PURCHASING",
      "GOODS_RECEIVED",
    ].includes(o.status)
  ).length;
  const production = data.filter((o) =>
    ["IN_PRODUCTION", "DESIGN_REVIEW"].includes(o.status)
  ).length;
  const dispatch = data.filter((o) =>
    ["PREPARING", "DISPATCHED"].includes(o.status)
  ).length;

  return {
    finance,
    stock,
    production,
    dispatch,
    total: data.length,
  };
}
