import "server-only";
import type { createTypedAdminClient } from "@/lib/supabase/admin-client";
import type { MeliLot } from "../types";

type Admin = ReturnType<typeof createTypedAdminClient>;

export async function loadMeliLots(
  admin: Admin,
  orgId: string,
  warehouseId: string,
  productIds: string[]
): Promise<MeliLot[]> {
  const lots: MeliLot[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await admin
      .from("product_lots")
      .select(
        "id, product_id, product_variant_id, quantity_available, unit_quantity_available, expiration_date, created_at, lot_number"
      )
      .eq("organization_id", orgId)
      .eq("warehouse_id", warehouseId)
      .in("product_id", productIds)
      .gt("quantity_available", 0)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) {
      throw new Error("No se pudo consultar el stock del depósito Meli.");
    }
    lots.push(...result.data);
    if (result.data.length < 500) {
      return lots;
    }
  }
}

export async function loadMeliPrices(
  admin: Admin,
  orgId: string,
  productIds: string[]
) {
  const [direct, fallback] = await Promise.all([
    admin
      .from("direct_sale_prices")
      .select("product_id, price")
      .eq("organization_id", orgId)
      .in("product_id", productIds),
    admin
      .from("products_with_price")
      .select("id, calculated_sale_price")
      .eq("organization_id", orgId)
      .in("id", productIds),
  ]);
  if (direct.error || fallback.error) {
    throw new Error("No se pudieron consultar los precios de Venta Directa.");
  }
  const prices = new Map<string, number>();
  for (const row of fallback.data) {
    if (row.id) {
      prices.set(row.id, row.calculated_sale_price ?? 0);
    }
  }
  for (const row of direct.data) {
    prices.set(row.product_id, row.price);
  }
  return prices;
}
