"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { emitSaleInvoice } from "../server/sale-invoicing.service";
import type { ArcaActionResult, ArcaSaleInvoiceResult } from "../types";

export async function emitSaleInvoiceAction(input: {
  orgSlug: string;
  saleId: string;
}): Promise<ArcaActionResult<ArcaSaleInvoiceResult>> {
  const detailPath = `/org/${input.orgSlug}/ventas/${input.saleId}`;
  const listPath = `/org/${input.orgSlug}/ventas`;

  try {
    const result = await emitSaleInvoice(input);

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
