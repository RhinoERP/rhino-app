"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { emitSaleInvoice } from "../server/sale-invoicing.service";

export type BulkArcaInvoiceResult = {
  saleId: string;
  saleNumber: string;
  ok: boolean;
  error?: string;
  invoiceNumber?: string | null;
  idempotent?: boolean;
};

export type BulkArcaInvoiceActionResult = {
  success: boolean;
  results: BulkArcaInvoiceResult[];
  error?: string;
};

export async function bulkEmitSaleInvoicesAction(
  orgSlug: string,
  sales: Array<{ saleId: string; saleNumber: string }>
): Promise<BulkArcaInvoiceActionResult> {
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
      error: "No se pueden emitir más de 20 facturas a la vez",
    };
  }

  const results: BulkArcaInvoiceResult[] = [];

  for (const { saleId, saleNumber } of sales) {
    try {
      const result = await emitSaleInvoice({ orgSlug, saleId });
      results.push({
        saleId,
        saleNumber,
        ok: true,
        invoiceNumber: result.invoiceNumber,
        idempotent: result.idempotent,
      });
    } catch (error) {
      results.push({
        saleId,
        saleNumber,
        ok: false,
        error: toArcaUserMessage(error),
      });
    }
  }

  revalidatePath(`/org/${orgSlug}/ventas`);

  return {
    success: true,
    results,
  };
}
