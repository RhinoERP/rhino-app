import {
  getCreditNoteById,
  getCreditNotesByOrgSlug,
} from "../service/credit-notes.service";
import { creditNoteQueryKey, creditNotesQueryKey } from "./query-keys";

export const creditNotesServerQueryOptions = (orgSlug: string) => ({
  queryKey: creditNotesQueryKey(orgSlug),
  queryFn: () => getCreditNotesByOrgSlug(orgSlug),
});

export const creditNoteServerQueryOptions = (
  orgSlug: string,
  creditNoteId: string
) => ({
  queryKey: creditNoteQueryKey(orgSlug, creditNoteId),
  queryFn: () => getCreditNoteById(orgSlug, creditNoteId),
});
