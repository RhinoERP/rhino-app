"use server";

import { ArcaConnectionError, ArcaValidationError } from "../errors";
import {
  emitCreditNoteArcaInvoice,
  setCreditNoteAssociatedInvoice,
} from "../server/credit-note-invoicing.service";
import type { ArcaActionResult } from "../types";

export type EmitCreditNoteArcaResult = {
  creditNoteId: string;
  creditNoteNumber: string | null;
  cae: string | null;
  caeExpiresAt: string | null;
  authorizedAt: string | null;
  voucherNumber: number | null;
  voucherTypeCode: number | null;
  pointOfSale: number | null;
};

export type SetCreditNoteAssocInvoiceInput = {
  creditNoteId: string;
  assocInvoiceTypeCode: number;
  assocInvoicePointOfSale: number;
  assocInvoiceNumber: number;
};

export async function emitCreditNoteArcaInvoiceAction(
  orgSlug: string,
  creditNoteId: string
): Promise<ArcaActionResult<EmitCreditNoteArcaResult>> {
  try {
    const result = await emitCreditNoteArcaInvoice({ orgSlug, creditNoteId });

    return {
      success: true,
      data: {
        creditNoteId: result.creditNoteId,
        creditNoteNumber: result.creditNoteNumber,
        cae: result.cae,
        caeExpiresAt: result.caeExpiresAt,
        authorizedAt: result.authorizedAt,
        voucherNumber: result.voucherNumber,
        voucherTypeCode: result.voucherTypeCode,
        pointOfSale: result.pointOfSale,
      },
    };
  } catch (err) {
    const message =
      err instanceof ArcaValidationError || err instanceof ArcaConnectionError
        ? err.message
        : "Error inesperado al emitir la nota de crédito en ARCA.";

    return { success: false, error: message };
  }
}

export async function setCreditNoteAssocInvoiceAction(
  input: SetCreditNoteAssocInvoiceInput
): Promise<ArcaActionResult<void>> {
  try {
    await setCreditNoteAssociatedInvoice(input);
    return { success: true, data: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al vincular el comprobante.";
    return { success: false, error: message };
  }
}
