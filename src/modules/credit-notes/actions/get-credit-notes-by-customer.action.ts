"use server";

import { getCreditNotesByCustomerId } from "../service/credit-notes.service";
import type { CreditNote } from "../types";

export async function getCreditNotesByCustomerAction(
  orgSlug: string,
  customerId: string
): Promise<CreditNote[]> {
  try {
    return await getCreditNotesByCustomerId(orgSlug, customerId);
  } catch {
    return [];
  }
}
