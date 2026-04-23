"use server";

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
