"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customersQueryKey } from "@/modules/customers/queries/query-keys";
import { deletePreSaleAction } from "../actions/delete-pre-sale.action";
import { preSalesQueryKey, salesQueryKey } from "../queries/query-keys";

export function useDeletePreSale(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preSaleId: string) => {
      const result = await deletePreSaleAction({
        orgSlug,
        id: preSaleId,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo eliminar la preventa");
      }

      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preSalesQueryKey(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: customersQueryKey(orgSlug) }),
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["receivables"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-credit"] }),
      ]);
      toast.success("Preventa eliminada correctamente");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la preventa"
      );
    },
  });
}
