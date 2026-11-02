import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { StockItem, StockMetrics } from "../types";
import { getStockMeasureTotals } from "../utils/stock-measure-totals";

export function calculateWarehouseStockMetrics(
  items: StockItem[],
  costs: Map<string, number>,
  minimums: Map<string, number>,
  warehouseScoped = true
): StockMetrics {
  const stocked = items.filter((item) => item.total_stock > 0);
  const active = stocked.filter((item) => item.is_active);
  const metrics: StockMetrics = {
    warehouseScoped,
    totalProducts: warehouseScoped ? stocked.length : items.length,
    activeProducts: warehouseScoped
      ? active.length
      : items.filter((item) => item.is_active).length,
    inactiveProducts: warehouseScoped
      ? stocked.length - active.length
      : items.filter((item) => !item.is_active).length,
    totalUnits: 0,
    totalKg: 0,
    totalLt: 0,
    totalStockValue: 0,
    lowStockCount: 0,
  };
  for (const item of active) {
    const totals = getStockMeasureTotals(
      item.total_stock,
      item.unit_of_measure
    );
    metrics.totalUnits += totals.units;
    metrics.totalKg += totals.kg;
    metrics.totalLt += totals.lt;
    metrics.totalStockValue +=
      item.total_stock * (costs.get(item.product_id) ?? 0);
    const minimum = minimums.get(item.product_id);
    if (minimum != null && item.total_stock <= minimum) {
      metrics.lowStockCount += 1;
    }
  }
  metrics.totalKg = Math.round(metrics.totalKg * 10) / 10;
  metrics.totalLt = Math.round(metrics.totalLt * 10) / 10;
  return metrics;
}

function addLotBalances(
  lots: {
    product_id: string;
    quantity_available: number;
    unit_quantity_available: number | null;
    variant: { is_active: boolean } | null;
  }[],
  products: Map<string, { has_variants: boolean | null }>,
  balances: Map<string, { quantity: number; units: number }>
) {
  for (const lot of lots) {
    if (products.get(lot.product_id)?.has_variants && !lot.variant?.is_active) {
      continue;
    }
    const balance = balances.get(lot.product_id) ?? { quantity: 0, units: 0 };
    balance.quantity += lot.quantity_available;
    balance.units += lot.unit_quantity_available ?? 0;
    balances.set(lot.product_id, balance);
  }
}

export async function fetchWarehouseBalances(
  supabase: SupabaseClient<Database>,
  orgId: string,
  warehouseId: string | undefined,
  products: Map<string, { has_variants: boolean | null }>
) {
  const balances = new Map<string, { quantity: number; units: number }>();
  const ids = [...products.keys()];
  for (let start = 0; start < ids.length; start += 500) {
    for (let offset = 0; ; offset += 1000) {
      let query = supabase
        .from("product_lots")
        .select(
          "id, product_id, quantity_available, unit_quantity_available, variant:product_variants!product_lots_variant_fk(is_active)"
        )
        .eq("organization_id", orgId)
        .in("product_id", ids.slice(start, start + 500))
        .order("id");
      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }
      const { data, error } = await query.range(offset, offset + 999);
      if (error) {
        throw new Error(`No se pudo consultar el stock: ${error.message}`);
      }
      addLotBalances(data ?? [], products, balances);
      if ((data?.length ?? 0) < 1000) {
        break;
      }
    }
  }
  return balances;
}
