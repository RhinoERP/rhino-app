"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { cancelSaleOrder } from "../service/sales.service";
import type {
  BulkActionResult,
  BulkSaleResult,
} from "./bulk-confirm-sales.action";

export async function bulkCancelSalesAction(
  orgSlug: string,
  sales: Array<{ saleId: string; saleNumber: string }>
): Promise<BulkActionResult> {
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

  for (const { saleId, saleNumber } of sales) {
    try {
      await cancelSaleOrder(orgSlug, saleId);
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
