"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCarrierAction } from "../actions/create-carrier.action";
import { deleteCarrierAction } from "../actions/delete-carrier.action";
import { updateCarrierAction } from "../actions/update-carrier.action";
import { carriersQueryKey } from "../queries/query-keys";
import type {
  CreateCarrierInput,
  UpdateCarrierInput,
} from "../service/carriers.service";

export function useCarrierMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createCarrier = useMutation({
    mutationFn: async (payload: Omit<CreateCarrierInput, "orgSlug">) => {
      const result = await createCarrierAction({ orgSlug, ...payload });
      if (!result.success) {
        throw new Error(result.error || "No se pudo crear el transporte");
      }
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: carriersQueryKey(orgSlug),
      });
    },
  });

  const updateCarrier = useMutation({
    mutationFn: async (payload: UpdateCarrierInput) => {
      const result = await updateCarrierAction(payload);
      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar el transporte");
      }
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: carriersQueryKey(orgSlug),
      });
    },
  });

  const deleteCarrier = useMutation({
    mutationFn: async (carrierId: string) => {
      const result = await deleteCarrierAction(carrierId);
      if (!result.success) {
        throw new Error(result.error || "No se pudo eliminar el transporte");
      }
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: carriersQueryKey(orgSlug),
      });
    },
  });

  return { createCarrier, updateCarrier, deleteCarrier };
}
