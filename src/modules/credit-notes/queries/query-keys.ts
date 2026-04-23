export const creditNotesQueryKey = (orgSlug: string) =>
  ["credit-notes", orgSlug] as const;

export const creditNoteQueryKey = (orgSlug: string, creditNoteId: string) =>
  ["credit-notes", orgSlug, creditNoteId] as const;
