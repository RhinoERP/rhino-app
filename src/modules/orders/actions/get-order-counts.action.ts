"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export type OrderAreaCounts = {
  finance: number;
  stock: number;
  production: number;
  dispatch: number;
  total: number;
};

export async function getOrderCountsAction(
  orgSlug: string
): Promise<OrderAreaCounts> {
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
    }

    // biome-ignore lint/suspicious/noExplicitAny: Supabase types not generated for new orders tables
    const supabase = (await createClient()) as any;

    const { data } = await supabase
      .from("orders")
      .select("status")
      .eq("organization_id", org.id)
      .not("status", "in", '("DELIVERED","CANCELLED","FINANCE_REJECTED")');

    if (!data) {
      return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
    }

    const counts = {
      finance: data.filter(
        (o: { status: string }) => o.status === "PENDING_FINANCE"
      ).length,
      stock: data.filter((o: { status: string }) =>
        ["PENDING_STOCK", "PURCHASE_REQUIRED", "PURCHASING"].includes(o.status)
      ).length,
      production: data.filter((o: { status: string }) =>
        [
          "IN_PRODUCTION",
          "DESIGN_REVIEW",
          "GOODS_RECEIVED",
          "STOCK_OK",
        ].includes(o.status)
      ).length,
      dispatch: data.filter((o: { status: string }) =>
        ["PREPARING", "DISPATCHED"].includes(o.status)
      ).length,
      total: data.length,
    };

    return counts;
  } catch {
    return { finance: 0, stock: 0, production: 0, dispatch: 0, total: 0 };
  }
}
