"use server";
import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "@/modules/arca/errors";
import { reconcileMeliCreditNote } from "@/modules/arca/server/credit-note-invoicing.service";
import { MeliConfirmationError } from "../errors";
import {
  cancelUnissuedMeliCreditNote,
  createMeliCreditNote,
  emitMeliCreditNote,
} from "../service/meli-credit-note.service";
import { generateMeliCreditNoteHtml } from "../service/meli-credit-note-pdf.service";
import { getMeliCreditNoteContext } from "../service/meli-credit-note-read.service";
import { tryMeliFiscalAutomaticPublication } from "../service/meli-fiscal-automatic.service";

export async function createMeliCreditNoteAction(
  orgSlug: string,
  input: unknown
) {
  try {
    const data = await createMeliCreditNote(orgSlug, input);
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre`, "layout");
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: toArcaUserMessage(error),
      canEdit: error instanceof MeliConfirmationError && error.canEdit,
    };
  }
}

export async function emitMeliCreditNoteAction(
  orgSlug: string,
  creditNoteId: string
) {
  try {
    const context = await getMeliCreditNoteContext(orgSlug, creditNoteId);
    const data = await emitMeliCreditNote(orgSlug, creditNoteId);
    const accountingWarning =
      data.status === "authorized"
        ? await tryMeliFiscalAutomaticPublication(orgSlug, {
            type: "creditNote",
            saleId: context.sale.id,
            creditNoteId,
          })
        : null;
    revalidatePath(
      `/org/${orgSlug}/venta-directa/mercado-libre/${context.sale.id}`
    );
    return { success: true as const, data, accountingWarning };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}

export async function downloadMeliCreditNoteAction(
  orgSlug: string,
  creditNoteId: string
) {
  try {
    return {
      success: true as const,
      data: await generateMeliCreditNoteHtml(orgSlug, creditNoteId),
    };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}

export async function cancelMeliCreditNoteAction(
  orgSlug: string,
  creditNoteId: string
) {
  try {
    const data = await cancelUnissuedMeliCreditNote(orgSlug, creditNoteId);
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre`, "layout");
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}

export async function reconcileMeliCreditNoteAction(
  orgSlug: string,
  creditNoteId: string
) {
  try {
    const context = await getMeliCreditNoteContext(orgSlug, creditNoteId);
    const data = await reconcileMeliCreditNote(orgSlug, creditNoteId);
    const accountingWarning =
      data.status === "authorized"
        ? await tryMeliFiscalAutomaticPublication(orgSlug, {
            type: "creditNote",
            saleId: context.sale.id,
            creditNoteId,
          })
        : null;
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre`, "layout");
    return { success: true as const, data, accountingWarning };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}
