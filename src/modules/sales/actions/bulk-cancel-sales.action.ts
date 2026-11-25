"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/supabase/auth";
import { checkReentryWarehouse } from "@/modules/inventory/service/stock-reentry.service";
import { isStockReentryFallbackRequired } from "@/modules/inventory/utils/stock-reentry";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { cancelSaleOrder } from "../service/sales.service";
import type {
  BulkActionResult,
  BulkSaleResult,
} from "./bulk-confirm-sales.action";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: checks all warehouses before the batch while retaining per-sale cancellation results.
export async function bulkCancelSalesAction(
  orgSlug: string,
  sales: Array<{ saleId: string; saleNumber: string }>,
  allowDefaultFallback = false
): Promise<BulkActionResult & { requiresDefaultFallback?: boolean }> {
  await ensure("sales.manage", orgSlug);
  if (sales.length === 0) {
    return {
      success: false,
      results: [],
      error: "No hay ventas seleccionadas",
    };
  }

  if (sales.length > 20) {
    return {
      success: false,
      results: [],
      error: "No se pueden cancelar más de 20 ventas a la vez",
    };
  }

  const results: BulkSaleResult[] = [];
  try {
    const auth = await requireAuth();
    const org = await getOrganizationBySlug(orgSlug);
    if (!(auth && org)) {
      throw new Error("Organización no disponible");
    }
    const { data: rows, error } = await auth.supabase
      .from("sales_orders")
      .select("warehouse_id, status")
      .eq("organization_id", org.id)
      .in(
        "id",
        sales.map((sale) => sale.saleId)
      );
    if (
      error ||
      rows?.length !== new Set(sales.map((sale) => sale.saleId)).size
    ) {
      throw new Error("No se pudieron consultar las ventas seleccionadas");
    }
    for (const sale of rows) {
      if (["CONFIRMED", "DISPATCH", "DELIVERED"].includes(sale.status)) {
        await checkReentryWarehouse({
          supabase: auth.supabase,
          orgId: org.id,
          warehouseId: sale.warehouse_id,
          allowDefaultFallback,
        });
      }
    }
  } catch (error) {
    return {
      success: false,
      results: [],
      error:
        error instanceof Error
          ? error.message
          : "No se pudo validar la cancelación",
      requiresDefaultFallback: isStockReentryFallbackRequired(error),
    };
  }

  for (const { saleId, saleNumber } of sales) {
    try {
      await cancelSaleOrder(orgSlug, saleId, allowDefaultFallback);
      results.push({ saleId, saleNumber, ok: true });
    } catch (err) {
      results.push({
        saleId,
        saleNumber,
        ok: false,
        error: err instanceof Error ? err.message : "Error al cancelar",
      });
    }
  }

  revalidatePath(`/org/${orgSlug}/ventas`);
  revalidatePath(`/org/${orgSlug}/cobranzas`);

  return { success: true, results };
}
