export const debitNotesQueryKey = (orgSlug: string) =>
  ["org", orgSlug, "debit-notes"] as const;

export const debitNoteDetailQueryKey = (orgSlug: string, debitNoteId: string) =>
  ["org", orgSlug, "debit-notes", debitNoteId] as const;
