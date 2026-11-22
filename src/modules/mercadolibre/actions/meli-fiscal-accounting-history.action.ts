"use server";

import {
  getMeliFiscalAccountingSnapshot,
  listMeliFiscalJournalEntries,
} from "../service/meli-fiscal-accounting-history.service";

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
