"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { emitPosSaleInvoice } from "../server/pos-sale-invoicing.service";
import type { ArcaActionResult, ArcaSaleInvoiceResult } from "../types";

export async function emitPosSaleInvoiceAction(input: {
  orgSlug: string;
  posSaleId: string;
  invoiceType: "FACTURA_B" | "FACTURA_C";
}): Promise<ArcaActionResult<ArcaSaleInvoiceResult>> {
  const detailPath = `/org/${input.orgSlug}/venta-directa/${input.posSaleId}`;
  const listPath = `/org/${input.orgSlug}/venta-directa`;

  try {
    const result = await emitPosSaleInvoice(input);

    revalidatePath(listPath);
    revalidatePath(detailPath);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    revalidatePath(listPath);
    revalidatePath(detailPath);

    return {
      success: false,
      error: toArcaUserMessage(error),
    };
  }
}
