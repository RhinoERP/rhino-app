"use client";

import { useQuery } from "@tanstack/react-query";
import {
  creditNoteClientQueryOptions,
  creditNotesByCustomerClientQueryOptions,
  creditNotesClientQueryOptions,
} from "../queries/queries.client";
import type { CreditNote } from "../types";

export function useCreditNotes(orgSlug: string) {
  return useQuery<CreditNote[]>(creditNotesClientQueryOptions(orgSlug));
}

export function useCreditNote(orgSlug: string, creditNoteId: string) {
  return useQuery<CreditNote | null>(
    creditNoteClientQueryOptions(orgSlug, creditNoteId)
  );
}

export function useCustomerCreditNotes(
  orgSlug: string,
  customerId: string,
  enabled: boolean
) {
  return useQuery<CreditNote[]>({
    ...creditNotesByCustomerClientQueryOptions(orgSlug, customerId),
    enabled,
  });
}
