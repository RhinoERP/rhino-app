"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTaxAction } from "../actions/create-tax.action";
import { deleteTaxAction } from "../actions/delete-tax.action";
import { updateTaxAction } from "../actions/update-tax.action";
import { taxesQueryKey } from "../queries/query-keys";
import type { CreateTaxInput, UpdateTaxInput } from "../service/taxes.service";

export function useTaxMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createTax = useMutation({
    mutationFn: async (payload: Omit<CreateTaxInput, "orgSlug">) => {
      const result = await createTaxAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear el impuesto");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: taxesQueryKey(orgSlug),
      });
    },
  });

  const updateTax = useMutation({
    mutationFn: async (payload: UpdateTaxInput & { taxId: string }) => {
      const result = await updateTaxAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar el impuesto");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: taxesQueryKey(orgSlug),
      });
    },
  });

  const deleteTax = useMutation({
    mutationFn: async (taxId: string) => {
      const result = await deleteTaxAction({ taxId });

      if (!result.success) {
        throw new Error(result.error || "No se pudo eliminar el impuesto");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: taxesQueryKey(orgSlug),
      });
    },
  });

  return {
    createTax,
    updateTax,
    deleteTax,
  };
}
