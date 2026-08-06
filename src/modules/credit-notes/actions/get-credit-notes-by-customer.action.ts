"use server";

import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getCreditNotesByCustomerId } from "../service/credit-notes.service";
import type { CreditNote } from "../types";

export async function getCreditNotesByCustomerAction(
  orgSlug: string,
  customerId: string
): Promise<CreditNote[]> {
  await ensure("creditnotes.manage", orgSlug);
  try {
    return await getCreditNotesByCustomerId(orgSlug, customerId);
  } catch {
    return [];
  }
}
