"use server";

import { createClient } from "@/lib/supabase/server";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getQuoteItemsWarehouseId } from "../service/order-warehouse.service";
import type { StockInfo } from "../types";

export type StockForOrderItem = {
  quoteItemId: string;
  productId: string;
  quantityNeeded: number;
  productVariantId?: string | null;
};

export async function getStockForOrderAction(
  orgSlug: string,
  items: StockForOrderItem[]
): Promise<StockInfo[]> {
  await ensure("orders.stock_review", orgSlug);
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
  const warehouseId = await getQuoteItemsWarehouseId({
    supabase,
    orgId: org.id,
    quoteItemIds: items.map((item) => item.quoteItemId),
  });

  const { data: stockData, error } = await supabase
    .from("products")
    .select("id, name, brand")
    .eq("organization_id", org.id)
    .in("id", productIds);
  const { data: lots, error: lotsError } = await supabase
    .from("product_lots")
    .select("product_id, product_variant_id, quantity_available")
    .eq("organization_id", org.id)
    .eq("warehouse_id", warehouseId)
    .in("product_id", productIds);
  if (lotsError) {
    throw new Error(`Error al consultar saldos: ${lotsError.message}`);
  }

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
      .select("id, talle, color")
      .eq("organization_id", org.id)
      .in("id", variantIds);

    variantsWithStock = (variantData ?? []).map((v) => ({
      id: v.id,
      talle: v.talle,
      color: v.color,
      stock: (lots ?? [])
        .filter((lot) => lot.product_variant_id === v.id)
        .reduce((sum, lot) => sum + lot.quantity_available, 0),
    }));
  }

  const variantStockMap = new Map(variantsWithStock.map((v) => [v.id, v]));

  return items.map((item) => {
    const stock = stockData?.find((s) => s.id === item.productId);
    const stockAvailable = (lots ?? [])
      .filter(
        (lot) =>
          lot.product_id === item.productId && lot.product_variant_id === null
      )
      .reduce((sum, lot) => sum + lot.quantity_available, 0);

    if (item.productVariantId) {
      const variantInfo = variantStockMap.get(item.productVariantId);
      const variantStock = variantInfo?.stock ?? 0;

      return {
        product_id: item.productId,
        product_name: stock?.name ?? "Desconocido",
        brand: stock?.brand ?? null,
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
      product_name: stock?.name ?? "Desconocido",
      brand: stock?.brand ?? null,
      quantity_needed: item.quantityNeeded,
      stock_available: stockAvailable,
      has_stock: stockAvailable >= item.quantityNeeded,
    };
  });
}
