"use server";

import { getCurrentUserId } from "@/lib/supabase/admin";
import { getDebitNotesByOrgSlug } from "../service/debit-notes.service";
import type { DebitNote } from "../types";

export async function getDebitNotesAction(
  orgSlug: string
): Promise<DebitNote[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }

  return await getDebitNotesByOrgSlug(orgSlug);
}
