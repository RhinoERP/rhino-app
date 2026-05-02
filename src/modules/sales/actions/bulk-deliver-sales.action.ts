"use server";

import { revalidatePath } from "next/cache";
import { deliverSaleOrder } from "../service/sales.service";
import type {
  BulkActionResult,
  BulkSaleResult,
} from "./bulk-confirm-sales.action";

export async function bulkDeliverSalesAction(
  orgSlug: string,
  sales: Array<{ saleId: string; saleNumber: string }>
): Promise<BulkActionResult> {
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
      error: "No se pueden entregar más de 20 ventas a la vez",
    };
  }

  const results: BulkSaleResult[] = [];

  for (const { saleId, saleNumber } of sales) {
    try {
      await deliverSaleOrder({ orgSlug, saleId });
      results.push({ saleId, saleNumber, ok: true });
    } catch (err) {
      results.push({
        saleId,
        saleNumber,
        ok: false,
        error: err instanceof Error ? err.message : "Error al entregar",
      });
    }
  }

  revalidatePath(`/org/${orgSlug}/ventas`);

  return { success: true, results };
}
