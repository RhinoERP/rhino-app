"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export type StockInfo = {
  product_id: string;
  product_name: string;
  quantity_needed: number;
  stock_available: number;
  has_stock: boolean;
};

export async function getStockForOrderAction(
  orgSlug: string,
  productIds: string[],
  quantitiesNeeded: Record<string, number>
): Promise<StockInfo[]> {
  if (!productIds.length) {
    return [];
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }

  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return [];
    }

    const supabase = await createClient();

    const { data } = await supabase
      .from("view_stock_detail")
      .select("*")
      .eq("organization_id", org.id)
      .in("product_id", productIds);

    if (!data) {
      return [];
    }

    return data.map((p) => {
      const needed = quantitiesNeeded[p.product_id ?? ""] ?? 0;
      const available = p.total_stock ?? 0;
      return {
        product_id: p.product_id ?? "",
        product_name: p.name ?? "Producto",
        quantity_needed: needed,
        stock_available: available,
        has_stock: available >= needed,
      };
    });
  } catch {
    return [];
  }
}
