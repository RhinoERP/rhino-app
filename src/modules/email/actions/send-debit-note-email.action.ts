"use server";

import { revalidatePath } from "next/cache";
import { sendDebitNoteEmail } from "../service/send-debit-note-email";

export async function sendDebitNoteEmailAction(input: {
  orgSlug: string;
  debitNoteId: string;
}) {
  const result = await sendDebitNoteEmail(input);
  revalidatePath(`/org/${input.orgSlug}/notas-de-debito/${input.debitNoteId}`);
  return result;
}
