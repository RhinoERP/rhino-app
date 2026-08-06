"use server";

import { revalidatePath } from "next/cache";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  type CreateReturnCreditNoteInput,
  type CreateReturnCreditNoteResult,
  createReturnCreditNoteFromCreditNotesSection,
} from "../service/return-credit-note.service";

type ActionResult =
  | { success: true; data: CreateReturnCreditNoteResult }
  | { success: false; error: string };

export async function createReturnCreditNoteAction(
  input: CreateReturnCreditNoteInput
): Promise<ActionResult> {
  await ensure("creditnotes.manage", input.orgSlug);
  try {
    const data = await createReturnCreditNoteFromCreditNotesSection(input);
    revalidatePath(`/org/${input.orgSlug}/notas-de-credito`);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al crear la nota de crédito por devolución",
    };
  }
}
