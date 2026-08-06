"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { dispatchSaleOrder } from "../service/sales.service";
import type {
  BulkActionResult,
  BulkSaleResult,
} from "./bulk-confirm-sales.action";

export type BulkDispatchItem = {
  saleId: string;
  saleNumber: string;
  remittanceNumber: string;
  carrierId?: string | null;
};

export async function bulkDispatchSalesAction(
  orgSlug: string,
  items: BulkDispatchItem[]
): Promise<BulkActionResult> {
  await ensure("sales.manage", orgSlug);
  if (items.length === 0) {
    return {
      success: false,
      results: [],
      error: "No hay ventas seleccionadas",
    };
  }

  if (items.length > 20) {
    return {
      success: false,
      results: [],
      error: "No se pueden despachar más de 20 ventas a la vez",
    };
  }

  const results: BulkSaleResult[] = [];

  for (const item of items) {
    try {
      await dispatchSaleOrder({
        orgSlug,
        saleId: item.saleId,
        remittanceNumber: item.remittanceNumber,
        carrierId: item.carrierId ?? null,
      });
      results.push({
        saleId: item.saleId,
        saleNumber: item.saleNumber,
        ok: true,
      });
    } catch (err) {
      results.push({
        saleId: item.saleId,
        saleNumber: item.saleNumber,
        ok: false,
        error: err instanceof Error ? err.message : "Error al despachar",
      });
    }
  }

  revalidatePath(`/org/${orgSlug}/ventas`);

  return { success: true, results };
}
