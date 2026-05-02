"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { emitSaleInvoice } from "../server/sale-invoicing.service";
import type {
  ArcaActionResult,
  ArcaBulkSaleInvoiceItemResult,
  ArcaBulkSaleInvoiceResult,
} from "../types";

type BulkSaleInvoiceInput = {
  orgSlug: string;
  sales: Array<{
    saleId: string;
    saleNumber?: string | null;
    customerName?: string | null;
  }>;
};

function dedupeSales(
  sales: BulkSaleInvoiceInput["sales"]
): BulkSaleInvoiceInput["sales"] {
  const seen = new Set<string>();

  return sales.filter((sale) => {
    if (!sale.saleId || seen.has(sale.saleId)) {
      return false;
    }

    seen.add(sale.saleId);
    return true;
  });
}

function normalizeBulkItem(
  sale: BulkSaleInvoiceInput["sales"][number],
  item: Omit<
    ArcaBulkSaleInvoiceItemResult,
    "saleId" | "saleNumber" | "customerName"
  >
): ArcaBulkSaleInvoiceItemResult {
  return {
    saleId: sale.saleId,
    saleNumber: sale.saleNumber ?? null,
    customerName: sale.customerName ?? null,
    ...item,
  };
}

export async function emitBulkSaleInvoicesAction(
  input: BulkSaleInvoiceInput
): Promise<ArcaActionResult<ArcaBulkSaleInvoiceResult>> {
  const sales = dedupeSales(input.sales);

  if (sales.length === 0) {
    return {
      success: false,
      error: "Seleccioná al menos una venta para emitir en ARCA.",
    };
  }

  const results: ArcaBulkSaleInvoiceItemResult[] = [];

  for (const sale of sales) {
    try {
      const result = await emitSaleInvoice({
        orgSlug: input.orgSlug,
        saleId: sale.saleId,
      });

      results.push(
        normalizeBulkItem(sale, {
          status: result.idempotent ? "already_authorized" : "authorized",
          invoiceNumber: result.invoiceNumber,
          cae: result.cae,
          message: result.idempotent
            ? "La venta ya tenía una factura ARCA emitida."
            : "Factura ARCA emitida correctamente.",
        })
      );
    } catch (error) {
      results.push(
        normalizeBulkItem(sale, {
          status: "error",
          invoiceNumber: null,
          cae: null,
          message: toArcaUserMessage(error),
        })
      );
    }
  }

  const data: ArcaBulkSaleInvoiceResult = {
    processedCount: results.length,
    authorizedCount: results.filter((item) => item.status === "authorized")
      .length,
    alreadyAuthorizedCount: results.filter(
      (item) => item.status === "already_authorized"
    ).length,
    errorCount: results.filter((item) => item.status === "error").length,
    results,
  };

  revalidatePath(`/org/${input.orgSlug}/ventas`);
  revalidatePath(`/org/${input.orgSlug}/arca/facturas`);

  for (const sale of sales) {
    revalidatePath(`/org/${input.orgSlug}/ventas/${sale.saleId}`);
  }

  return {
    success: true,
    data,
  };
}
