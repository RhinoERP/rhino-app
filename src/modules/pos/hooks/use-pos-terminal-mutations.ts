"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPosTerminalAction } from "../actions/create-pos-terminal.action";
import { posTerminalsQueryKey } from "../queries/pos.client";
import type { CreatePosTerminalInput } from "../types";

export function usePosTerminalMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createTerminal = useMutation({
    mutationFn: async (payload: Omit<CreatePosTerminalInput, "orgSlug">) => {
      const result = await createPosTerminalAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear la terminal POS.");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: posTerminalsQueryKey(orgSlug),
      });
    },
  });

  return {
    createTerminal,
  };
}
