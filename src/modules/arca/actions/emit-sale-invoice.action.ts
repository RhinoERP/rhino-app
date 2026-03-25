"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { emitSaleInvoice } from "../server/sale-invoicing.service";
import type { ArcaActionResult, ArcaSaleInvoiceResult } from "../types";

export async function emitSaleInvoiceAction(input: {
  orgSlug: string;
  saleId: string;
}): Promise<ArcaActionResult<ArcaSaleInvoiceResult>> {
  try {
    const result = await emitSaleInvoice(input);

    revalidatePath(`/org/${input.orgSlug}/ventas`);
    revalidatePath(`/org/${input.orgSlug}/ventas/${input.saleId}`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
    };
  }
}
