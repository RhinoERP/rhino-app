"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateManualJournalEntryInput,
  createManualJournalEntry,
} from "@/lib/accounting-client";

export function useCreateManualJournalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateManualJournalEntryInput) =>
      createManualJournalEntry(input),
    onSuccess: (_entryId, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["accounting", "diario", variables.orgId],
      });
    },
  });
}
