"use server";

import { createClient } from "@/lib/supabase/server";

export type StockInfo = {
  product_id: string;
  product_name: string;
  quantity_needed: number;
  stock_available: number;
  has_stock: boolean;
};

export async function getStockForOrderAction(
  productIds: string[],
  quantitiesNeeded: Record<string, number>
): Promise<StockInfo[]> {
  if (!productIds.length) {
    return [];
  }

  try {
    const supabase = await createClient();

    // biome-ignore lint/suspicious/noExplicitAny: view_stock_detail not in generated Supabase types
    const { data } = await (supabase as any)
      .from("view_stock_detail")
      .select("*")
      .in("product_id", productIds);

    if (!data) {
      return [];
    }

    // biome-ignore lint/suspicious/noExplicitAny: view_stock_detail not in generated Supabase types
    return data.map((p: any) => {
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
