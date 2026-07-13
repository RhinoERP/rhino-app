"use server";

import { createClient } from "@/lib/supabase/server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import type { StockInfo } from "../types";

export type StockForOrderItem = {
  productId: string;
  quantityNeeded: number;
  productVariantId?: string | null;
};

export async function getStockForOrderAction(
  orgSlug: string,
  items: StockForOrderItem[]
): Promise<StockInfo[]> {
  await guardOrganizationPermissionAccess(orgSlug, "orders.stock_review");
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

  // Fetch per-variant stock for items with variants
  const variantIds = items
    .map((i) => i.productVariantId)
    .filter((id): id is string => Boolean(id));

  let variantsWithStock: Array<{
    id: string;
    talle: string;
    color: string;
    stock: number;
  }> = [];

  if (variantIds.length > 0) {
    const { data: variantData } = await supabase
      .from("product_variants")
      .select("id, talle, color, product_lots(quantity_available)")
      .eq("organization_id", org.id)
      .in("id", variantIds);

    variantsWithStock = (variantData ?? []).map((v) => ({
      id: v.id,
      talle: v.talle,
      color: v.color,
      stock:
        (v as { product_lots?: { quantity_available: number } | null })
          .product_lots?.quantity_available ?? 0,
    }));
  }

  const variantStockMap = new Map(variantsWithStock.map((v) => [v.id, v]));

  return items.map((item) => {
    const stock = stockData?.find((s) => s.product_id === item.productId);
    const stockAvailable = stock?.total_stock ?? 0;

    if (item.productVariantId) {
      const variantInfo = variantStockMap.get(item.productVariantId);
      const variantStock = variantInfo?.stock ?? 0;

      return {
        product_id: item.productId,
        product_name: stock?.product_name ?? "Desconocido",
        quantity_needed: item.quantityNeeded,
        stock_available: variantStock,
        has_stock: variantStock >= item.quantityNeeded,
        variant_id: item.productVariantId,
        variant_talle: variantInfo?.talle ?? null,
        variant_color: variantInfo?.color ?? null,
        variant_stock: variantStock,
      };
    }

    return {
      product_id: item.productId,
      product_name: stock?.product_name ?? "Desconocido",
      quantity_needed: item.quantityNeeded,
      stock_available: stockAvailable,
      has_stock: stockAvailable >= item.quantityNeeded,
    };
  });
}
