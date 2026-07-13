"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { emitCreditNote } from "../server/credit-note-invoicing.service";
import type { ArcaActionResult, ArcaCreditNoteInvoiceResult } from "../types";

export async function emitCreditNoteAction(input: {
  orgSlug: string;
  creditNoteId: string;
}): Promise<ArcaActionResult<ArcaCreditNoteInvoiceResult>> {
  const detailPath = `/org/${input.orgSlug}/notas-de-credito/${input.creditNoteId}`;
  const listPath = `/org/${input.orgSlug}/notas-de-credito`;

  try {
    const result = await emitCreditNote(input);

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
