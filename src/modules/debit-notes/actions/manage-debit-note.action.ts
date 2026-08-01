"use server";

import { revalidatePath } from "next/cache";
import { ArcaAuthorizationError } from "@/modules/arca/errors";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";
import {
  createDebitNote,
  deleteDebitNote,
  updateDebitNote,
} from "../service/debit-notes.service";
import type { CreateDebitNoteInput, UpdateDebitNoteInput } from "../types";

async function assertDebitNoteManagePermission(orgSlug: string) {
  const layout = await getOrganizationLayoutData(orgSlug);
  const allowed =
    layout?.permissions.includes("organization.admin") ||
    (["debitnotes.manage", "sales.read", "arca.read"] as const).every(
      (permission) => layout?.permissions.includes(permission)
    );
  if (!allowed) {
    throw new ArcaAuthorizationError(
      "No tenés permisos para gestionar Notas de Débito."
    );
  }
}

function revalidate(orgSlug: string, debitNoteId?: string) {
  revalidatePath(`/org/${orgSlug}/notas-de-debito`);
  if (debitNoteId) {
    revalidatePath(`/org/${orgSlug}/notas-de-debito/${debitNoteId}`);
  }
}

export async function createDebitNoteAction(input: CreateDebitNoteInput) {
  try {
    await assertDebitNoteManagePermission(input.orgSlug);
    const debitNote = await createDebitNote(input);
    revalidate(input.orgSlug, debitNote.id);
    return { success: true as const, debitNote };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo crear la Nota de Débito.",
    };
  }
}

export async function updateDebitNoteAction(input: UpdateDebitNoteInput) {
  try {
    await assertDebitNoteManagePermission(input.orgSlug);
    const debitNote = await updateDebitNote(input);
    revalidate(input.orgSlug, debitNote.id);
    return { success: true as const, debitNote };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la Nota de Débito.",
    };
  }
}

export async function deleteDebitNoteAction(input: {
  orgSlug: string;
  debitNoteId: string;
}) {
  try {
    await assertDebitNoteManagePermission(input.orgSlug);
    await deleteDebitNote(input.orgSlug, input.debitNoteId);
    revalidate(input.orgSlug, input.debitNoteId);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la Nota de Débito.",
    };
  }
}
