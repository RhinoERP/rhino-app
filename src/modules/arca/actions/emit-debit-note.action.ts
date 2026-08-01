"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import {
  emitDebitNote,
  verifyDebitNoteEmission,
} from "../server/debit-note-invoicing.service";
import type { ArcaActionResult, ArcaDebitNoteInvoiceResult } from "../types";

function revalidate(orgSlug: string, debitNoteId: string) {
  revalidatePath(`/org/${orgSlug}/notas-de-debito`);
  revalidatePath(`/org/${orgSlug}/notas-de-debito/${debitNoteId}`);
}

export async function emitDebitNoteAction(input: {
  orgSlug: string;
  debitNoteId: string;
}): Promise<ArcaActionResult<ArcaDebitNoteInvoiceResult>> {
  try {
    const data = await emitDebitNote(input);
    revalidate(input.orgSlug, input.debitNoteId);
    return { success: true, data };
  } catch (error) {
    revalidate(input.orgSlug, input.debitNoteId);
    return { success: false, error: toArcaUserMessage(error) };
  }
}

export async function verifyDebitNoteEmissionAction(input: {
  orgSlug: string;
  debitNoteId: string;
}): Promise<ArcaActionResult<ArcaDebitNoteInvoiceResult>> {
  try {
    const data = await verifyDebitNoteEmission(input);
    revalidate(input.orgSlug, input.debitNoteId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toArcaUserMessage(error) };
  }
}
