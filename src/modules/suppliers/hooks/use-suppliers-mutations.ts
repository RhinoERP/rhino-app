"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupplierAction } from "../actions/create-supplier.action";
import { updateSupplierAction } from "../actions/update-supplier.action";
import { suppliersQueryKey } from "../queries/query-keys";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
} from "../service/suppliers.service";

export function useSupplierMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createSupplier = useMutation({
    mutationFn: async (payload: Omit<CreateSupplierInput, "orgSlug">) => {
      const result = await createSupplierAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear el proveedor");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: suppliersQueryKey(orgSlug),
      });
    },
  });

  const updateSupplier = useMutation({
    mutationFn: async (payload: Omit<UpdateSupplierInput, "orgSlug">) => {
      const result = await updateSupplierAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar el proveedor");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: suppliersQueryKey(orgSlug),
      });
    },
  });

  return {
    createSupplier,
    updateSupplier,
  };
}
