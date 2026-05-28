"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createOrderFromQuoteAction } from "../actions/create-order.action";
import {
  saveOrderDesignAction,
  updateOrderStatusAction,
} from "../actions/update-order-status.action";
import { orderDetailQueryKey, ordersQueryKey } from "../queries/query-keys";

export function useOrderMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createOrder = useMutation({
    mutationFn: async (quoteId: string) => {
      const result = await createOrderFromQuoteAction(orgSlug, quoteId);

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear el pedido");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ordersQueryKey(orgSlug),
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (input: {
      orderId: string;
      newStatus: Parameters<typeof updateOrderStatusAction>[0]["newStatus"];
      notes?: string;
      extraFields?: Record<string, unknown>;
    }) => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: input.orderId,
        newStatus: input.newStatus,
        notes: input.notes,
        extraFields: input.extraFields,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo actualizar el pedido");
      }

      return result;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ordersQueryKey(orgSlug),
      });
      await queryClient.invalidateQueries({
        queryKey: orderDetailQueryKey(orgSlug, variables.orderId),
      });
    },
  });

  const saveDesign = useMutation({
    mutationFn: async (input: {
      orderId: string;
      designData: Parameters<typeof saveOrderDesignAction>[2];
    }) => {
      const result = await saveOrderDesignAction(
        orgSlug,
        input.orderId,
        input.designData
      );

      if (!result.success) {
        throw new Error(result.error || "No se pudo guardar el boceto");
      }

      return result;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: orderDetailQueryKey(orgSlug, variables.orderId),
      });
    },
  });

  return {
    createOrder,
    updateStatus,
    saveDesign,
  };
}
