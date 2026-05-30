"use server";

import { createClient } from "@/lib/supabase/server";
import type { StockInfo } from "../types";

export type StockForOrderItem = {
  productId: string;
  quantityNeeded: number;
};

export async function getStockForOrderAction(
  orgSlug: string,
  items: StockForOrderItem[]
): Promise<StockInfo[]> {
  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgError || !org) {
    return [];
  }

  if (items.length === 0) {
    return [];
  }

  const productIds = items.map((i) => i.productId);

  const { data: stockData, error } = await supabase
    .from("view_stock_detail")
    .select("product_id, product_name, total_stock")
    .eq("organization_id", org.id)
    .in("product_id", productIds);

  if (error) {
    throw new Error(`Error al consultar stock: ${error.message}`);
  }

  return items.map((item) => {
    const stock = stockData?.find((s) => s.product_id === item.productId);
    const stockAvailable = stock?.total_stock ?? 0;

    return {
      product_id: item.productId,
      product_name: stock?.product_name ?? "Desconocido",
      quantity_needed: item.quantityNeeded,
      stock_available: stockAvailable,
      has_stock: stockAvailable >= item.quantityNeeded,
    };
  });
}
