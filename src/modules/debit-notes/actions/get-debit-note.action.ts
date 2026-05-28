"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getDebitNoteById } from "../service/debit-notes.service";
import type { DebitNote } from "../types";

export async function getDebitNoteAction(
  orgSlug: string,
  debitNoteId: string
): Promise<DebitNote | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }

  return await getDebitNoteById(orgSlug, debitNoteId);
}
