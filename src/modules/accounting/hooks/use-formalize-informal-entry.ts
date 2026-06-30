"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formalizarEntry } from "@/lib/accounting-client";

export function useFormalizeInformalEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) => formalizarEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["accounting", "informal-entries"],
      });
      queryClient.invalidateQueries({
        queryKey: ["accounting", "informal-entry"],
      });
    },
  });
}
