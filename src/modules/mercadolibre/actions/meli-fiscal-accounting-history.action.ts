"use server";

import { requireAuth } from "@/lib/supabase/auth";
import {
  getMeliFiscalAccountingSnapshot,
  inspectMeliFiscalPostingPeriod,
  inspectMeliInvoiceReceipt,
  listMeliFiscalJournalEntries,
} from "../service/meli-fiscal-accounting-history.service";

export async function inspectMeliFiscalPostingPeriodAction(
  orgSlug: string,
  origin: unknown
) {
  try {
    const data = await inspectMeliFiscalPostingPeriod(orgSlug, origin);
    const auth = await requireAuth();
    if (!auth) {
      throw new Error("No autorizado.");
    }
    return { success: true as const, data, actorId: auth.userId };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo consultar el período contable.",
    };
  }
}

export async function listMeliFiscalJournalEntriesAction(
  orgSlug: string,
  origin: unknown
) {
  try {
    const data = await listMeliFiscalJournalEntries(orgSlug, origin);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo consultar la historia contable.",
    };
  }
}

export async function inspectMeliInvoiceReceiptAction(
  orgSlug: string,
  saleId: string
) {
  try {
    const data = await inspectMeliInvoiceReceipt(orgSlug, saleId);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo verificar el asiento de la factura.",
    };
  }
}

export async function getMeliFiscalAccountingSnapshotAction(
  orgSlug: string,
  origin: unknown
) {
  try {
    const data = await getMeliFiscalAccountingSnapshot(orgSlug, origin);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo consultar el comprobante fiscal.",
    };
  }
}
