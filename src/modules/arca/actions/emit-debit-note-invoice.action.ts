"use server";

import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import { getCurrentUserOrganizationArcaAccess } from "../server/access";
import {
  type EmitDebitNoteArcaResult,
  emitDebitNoteArcaInvoice,
} from "../server/debit-note-invoicing.service";
import type { ArcaActionResult } from "../types";

export type { EmitDebitNoteArcaResult } from "../server/debit-note-invoicing.service";

export async function emitDebitNoteArcaInvoiceAction(
  orgSlug: string,
  debitNoteId: string
): Promise<ArcaActionResult<EmitDebitNoteArcaResult>> {
  try {
    await getCurrentUserOrganizationArcaAccess(orgSlug);
    const result = await emitDebitNoteArcaInvoice(orgSlug, debitNoteId);
    return { success: true, data: result };
  } catch (err) {
    const message =
      err instanceof ArcaValidationError || err instanceof ArcaConnectionError
        ? err.message
        : sanitizeArcaErrorMessage(err);
    return { success: false, error: message };
  }
}
