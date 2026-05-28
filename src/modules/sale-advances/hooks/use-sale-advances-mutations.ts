"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAdvanceReceiptAction,
  createSaleAdvanceAction,
  creditAdvanceWithNoteAction,
} from "../actions/sale-advances.actions";
import { saleAdvancesQueryKey } from "../queries/query-keys";
import type { CreateAdvanceInput, CreateReceiptInput } from "../types";

export function useSaleAdvanceMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createAdvance = useMutation({
    mutationFn: async (payload: Omit<CreateAdvanceInput, "orgSlug">) => {
      const result = await createSaleAdvanceAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear el anticipo");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: saleAdvancesQueryKey(orgSlug),
      });
    },
  });

  const createReceipt = useMutation({
    mutationFn: async (payload: Omit<CreateReceiptInput, "orgSlug">) => {
      const result = await createAdvanceReceiptAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo registrar el cobro");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: saleAdvancesQueryKey(orgSlug),
      });
    },
  });

  const creditWithNote = useMutation({
    mutationFn: async (payload: {
      advanceId: string;
      creditNoteId: string;
    }) => {
      const result = await creditAdvanceWithNoteAction(
        orgSlug,
        payload.advanceId,
        payload.creditNoteId
      );

      if (!result.success) {
        throw new Error(result.error || "No se pudo acreditar el anticipo");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: saleAdvancesQueryKey(orgSlug),
      });
    },
  });

  return {
    createAdvance,
    createReceipt,
    creditWithNote,
  };
}
