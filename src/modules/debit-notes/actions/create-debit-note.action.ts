"use server";

import { createDebitNote } from "../service/debit-notes.service";
import type { CreateDebitNoteInput, CreateDebitNoteResult } from "../types";

type ActionResult =
  | ({ success: true } & CreateDebitNoteResult)
  | { success: false; error: string };

export async function createDebitNoteAction(
  input: CreateDebitNoteInput
): Promise<ActionResult> {
  try {
    const result = await createDebitNote(input);
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al crear la nota de débito",
    };
  }
}
