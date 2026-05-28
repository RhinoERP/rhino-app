"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPaymentOrderAction } from "../actions/create-payment-order.action";
import { paymentOrdersQueryKey } from "../queries/query-keys";
import type { CreatePaymentOrderInput } from "../types";

export function usePaymentOrderMutations(orgSlug: string) {
  const queryClient = useQueryClient();

  const createPaymentOrder = useMutation({
    mutationFn: async (payload: Omit<CreatePaymentOrderInput, "orgSlug">) => {
      const result = await createPaymentOrderAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear la orden de pago");
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: paymentOrdersQueryKey(orgSlug),
      });
    },
  });

  return {
    createPaymentOrder,
  };
}
