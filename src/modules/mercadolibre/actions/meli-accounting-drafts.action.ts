"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MeliConfirmationError } from "../errors";
import { saveMeliAccountingDraft } from "../service/meli-accounting-drafts.service";

function getErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo guardar el desglose.";
}

export async function saveMeliAccountingDraftAction(
  orgSlug: string,
  input: unknown
) {
  let data: Awaited<ReturnType<typeof saveMeliAccountingDraft>>;
  try {
    data = await saveMeliAccountingDraft(orgSlug, input);
  } catch (error) {
    return {
      success: false as const,
      error: getErrorMessage(error),
      canEdit:
        error instanceof ZodError ||
        (error instanceof MeliConfirmationError && error.canEdit),
    };
  }
  try {
    revalidatePath(`/org/${orgSlug}/cobranzas`, "layout");
    return { success: true as const, data, refreshRequired: false };
  } catch {
    return { success: true as const, data, refreshRequired: true };
  }
}
