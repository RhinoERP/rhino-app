import type { CreditNote } from "../types";
import { creditNoteQueryKey, creditNotesQueryKey } from "./query-keys";

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
