"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTaxAction } from "@/modules/taxes/actions/create-tax.action";
import { deleteTaxAction } from "@/modules/taxes/actions/delete-tax.action";
import { toggleTaxFavoriteAction } from "@/modules/taxes/actions/toggle-tax-favorite.action";
import { updateTaxAction } from "@/modules/taxes/actions/update-tax.action";
import { taxesQueryKey } from "@/modules/taxes/queries/query-keys";
import type {
  CreateTaxInput,
  UpdateTaxInput,
} from "@/modules/taxes/service/taxes.service";
import type { TaxFavoriteContext } from "@/modules/taxes/types";

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

  const toggleFavorite = useMutation({
    mutationFn: async (payload: {
      taxId: string;
      context: TaxFavoriteContext;
      isFavorite: boolean;
    }) => {
      const result = await toggleTaxFavoriteAction(payload);

      if (!result.success) {
        throw new Error(
          result.error || "No se pudo actualizar favorito del impuesto"
        );
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
    toggleFavorite,
  };
}
