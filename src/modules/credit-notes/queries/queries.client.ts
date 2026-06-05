import type { CreditNote } from "../types";
import {
  creditNoteQueryKey,
  creditNotesByCustomerQueryKey,
  creditNotesQueryKey,
} from "./query-keys";

export const creditNotesClientQueryOptions = (orgSlug: string) => ({
  queryKey: creditNotesQueryKey(orgSlug),
  queryFn: async (): Promise<CreditNote[]> => {
    const res = await fetch(`/api/org/${orgSlug}/notas-de-credito`);
    if (!res.ok) {
      throw new Error("Error al cargar las notas de crédito");
    }
    return res.json();
  },
  staleTime: 1000 * 60 * 5,
});

export const creditNoteClientQueryOptions = (
  orgSlug: string,
  creditNoteId: string
) => ({
  queryKey: creditNoteQueryKey(orgSlug, creditNoteId),
  queryFn: async (): Promise<CreditNote | null> => {
    const res = await fetch(
      `/api/org/${orgSlug}/notas-de-credito/${creditNoteId}`
    );
    if (!res.ok) {
      return null;
    }
    return res.json();
  },
  staleTime: 1000 * 60 * 5,
});

export const creditNotesByCustomerClientQueryOptions = (
  orgSlug: string,
  customerId: string
) => ({
  queryKey: creditNotesByCustomerQueryKey(orgSlug, customerId),
  queryFn: async (): Promise<CreditNote[]> => {
    const { getCreditNotesByCustomerAction } = await import(
      "../actions/get-credit-notes-by-customer.action"
    );
    return getCreditNotesByCustomerAction(orgSlug, customerId);
  },
  staleTime: 1000 * 60 * 5,
});
