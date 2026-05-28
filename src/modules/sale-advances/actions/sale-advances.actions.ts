"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/supabase/admin";
import {
  createAdvanceReceipt,
  createSaleAdvance,
  creditAdvanceWithNote,
  getSaleAdvances,
} from "../service/sale-advances.service";
import type {
  CreateAdvanceInput,
  CreateReceiptInput,
  SaleAdvance,
} from "../types";

type Result<T = void> = { success: boolean; error?: string; data?: T };

export async function createSaleAdvanceAction(
  input: CreateAdvanceInput
): Promise<Result<{ id: string; advance_number: number }>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const data = await createSaleAdvance(input);

    revalidatePath(`/org/${input.orgSlug}/ventas/anticipos`);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function createAdvanceReceiptAction(
  input: CreateReceiptInput
): Promise<Result<{ receiptId: string }>> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    const { receiptId } = await createAdvanceReceipt(input);

    revalidatePath(`/org/${input.orgSlug}/ventas/anticipos`);
    return { success: true, data: { receiptId } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function getSaleAdvancesAction(
  orgSlug: string
): Promise<SaleAdvance[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("No autorizado");
  }

  return await getSaleAdvances(orgSlug);
}

export async function creditAdvanceWithNoteAction(
  orgSlug: string,
  advanceId: string,
  creditNoteId: string
): Promise<Result> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "No autorizado" };
    }

    await creditAdvanceWithNote(orgSlug, advanceId, creditNoteId);

    revalidatePath(`/org/${orgSlug}/ventas/anticipos`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
