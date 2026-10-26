"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addSalesToRouteSheetAction } from "../actions/add-sales-to-route-sheet.action";
import { createRouteSheetAction } from "../actions/create-route-sheet.action";
import { deleteRouteSheetAction } from "../actions/delete-route-sheet.action";
import { removeSaleFromRouteSheetAction } from "../actions/remove-sale-from-route-sheet.action";
import { updateRouteSheetStatusAction } from "../actions/update-route-sheet-status.action";
import { routeSheetsQueryKey } from "../queries/query-keys";
import type {
  AddSalesToRouteSheetInput,
  CreateRouteSheetInput,
  DeleteRouteSheetInput,
  RemoveSaleFromRouteSheetInput,
  UpdateRouteSheetStatusInput,
} from "../service/route-sheets.service";

export function useRouteSheetMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: routeSheetsQueryKey(orgSlug),
    });
  };

  const createRouteSheet = useMutation({
    mutationFn: async (payload: Omit<CreateRouteSheetInput, "orgSlug">) => {
      const result = await createRouteSheetAction({ orgSlug, ...payload });
      if (!result.success) {
        throw new Error(result.error || "No se pudo crear la hoja de ruta");
      }
      return result;
    },
    onSuccess: invalidate,
  });

  const updateStatus = useMutation({
    mutationFn: async (
      payload: Omit<UpdateRouteSheetStatusInput, "orgSlug">
    ) => {
      const result = await updateRouteSheetStatusAction({
        orgSlug,
        ...payload,
      });
      if (!result.success) {
        throw new Error(
          result.error || "No se pudo actualizar la hoja de ruta"
        );
      }
      return result;
    },
    onSuccess: invalidate,
  });

  const addSales = useMutation({
    mutationFn: async (payload: Omit<AddSalesToRouteSheetInput, "orgSlug">) => {
      const result = await addSalesToRouteSheetAction({ orgSlug, ...payload });
      if (!result.success) {
        throw new Error(
          result.error || "No se pudieron agregar las ventas a la hoja de ruta"
        );
      }
      return result;
    },
    onSuccess: invalidate,
  });

  const removeSale = useMutation({
    mutationFn: async (
      payload: Omit<RemoveSaleFromRouteSheetInput, "orgSlug">
    ) => {
      const result = await removeSaleFromRouteSheetAction({
        orgSlug,
        ...payload,
      });
      if (!result.success) {
        throw new Error(
          result.error || "No se pudo quitar la venta de la hoja de ruta"
        );
      }
      return result;
    },
    onSuccess: invalidate,
  });

  const deleteRouteSheet = useMutation({
    mutationFn: async (payload: Omit<DeleteRouteSheetInput, "orgSlug">) => {
      const result = await deleteRouteSheetAction({ orgSlug, ...payload });
      if (!result.success) {
        throw new Error(result.error || "No se pudo eliminar la hoja de ruta");
      }
      return result;
    },
    onSuccess: invalidate,
  });

  return {
    createRouteSheet,
    updateStatus,
    addSales,
    removeSale,
    deleteRouteSheet,
  };
}
