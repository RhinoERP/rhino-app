"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createDebitNoteAction } from "../actions/create-debit-note.action";
import { debitNotesQueryKey } from "../queries/query-keys";
import type { CreateDebitNoteInput } from "../types";

export function useDebitNoteMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createDebitNote = useMutation({
    mutationFn: async (payload: Omit<CreateDebitNoteInput, "orgSlug">) => {
      const result = await createDebitNoteAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear la nota de débito");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: debitNotesQueryKey(orgSlug),
      });
    },
  });

  return {
    createDebitNote,
  };
}
