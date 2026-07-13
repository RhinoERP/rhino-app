"use server";

import { revalidatePath } from "next/cache";
import {
  type CreatePurchaseTargetCreditNoteInput,
  type CreatePurchaseTargetCreditNoteResult,
  createPurchaseTargetCreditNote,
} from "../service/purchase-target-credit.service";

type ActionResult =
  | { success: true; data: CreatePurchaseTargetCreditNoteResult }
  | { success: false; error: string };

export async function createPurchaseTargetCreditNoteAction(
  input: CreatePurchaseTargetCreditNoteInput
): Promise<ActionResult> {
  try {
    const data = await createPurchaseTargetCreditNote(input);
    revalidatePath(`/org/${input.orgSlug}/notas-de-credito`);
    return { success: true, data };
  } catch (error) {
    revalidatePath(`/org/${input.orgSlug}/notas-de-credito`);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo generar la nota de crédito por objetivo",
    };
  }
}
