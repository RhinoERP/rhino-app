"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { createCreditNote } from "../service/credit-notes.service";
import type { CreateCreditNoteInput, CreateCreditNoteResult } from "../types";

type ActionResult =
  | ({ success: true } & CreateCreditNoteResult)
  | { success: false; error: string };

export async function createCreditNoteAction(
  input: CreateCreditNoteInput
): Promise<ActionResult> {
  try {
    const result = await createCreditNote(input);
    revalidatePath(`/org/${input.orgSlug}/notas-de-credito`);
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al crear la nota de crédito",
    };
  }
}

export async function markCreditNoteAccountingJournalAction(input: {
  orgSlug: string;
  creditNoteId: string;
  journalEntryId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("credit_notes")
    .update({ accounting_journal_entry_id: input.journalEntryId } as never)
    .eq("id", input.creditNoteId)
    .eq("organization_id", org.id);

  if (error) {
    return {
      success: false,
      error: `No se pudo vincular el asiento formal: ${error.message}`,
    };
  }

  return { success: true };
}
