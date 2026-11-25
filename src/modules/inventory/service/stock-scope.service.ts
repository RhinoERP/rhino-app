import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { WarehouseAccessError } from "../utils/warehouse-access-error";

export function throwStockReadError(error: {
  code?: string;
  message: string;
}): never {
  if (error.code === "42501") {
    throw new WarehouseAccessError("No tenés acceso al stock solicitado", 403);
  }
  if (error.code === "22023") {
    throw new WarehouseAccessError("La consulta de stock es inválida", 400);
  }
  throw new Error(`No se pudo consultar el stock: ${error.message}`);
}

export async function fetchStockBalances(
  supabase: SupabaseClient<Database>,
  orgId: string,
  productIds: string[],
  warehouseId?: string
) {
  const balances = new Map<string, { quantity: number; units: number }>();
  const ids = [...new Set(productIds)];
  for (let offset = 0; offset < ids.length; offset += 500) {
    const { data, error } = await supabase.rpc("get_inventory_stock_balances", {
      p_org_id: orgId,
      p_product_ids: ids.slice(offset, offset + 500),
      ...(warehouseId ? { p_warehouse_id: warehouseId } : {}),
    });
    if (error) {
      throwStockReadError(error);
    }
    if (!data) {
      throw new Error("No se recibieron los saldos de stock");
    }
    for (const balance of data) {
      balances.set(balance.product_id, {
        quantity: balance.quantity_available,
        units: balance.unit_quantity_available,
      });
    }
  }
  return balances;
}
