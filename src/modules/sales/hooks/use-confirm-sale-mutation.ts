"use client";

import { useMutation } from "@tanstack/react-query";
import { confirmSaleAction } from "../actions/confirm-sale.action";
import type { ConfirmSaleOrderInput } from "../types";

export function useConfirmSaleMutation() {
  const confirmSale = useMutation({
    mutationFn: async (payload: ConfirmSaleOrderInput) => {
      const result = await confirmSaleAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo confirmar la venta");
      }

      return result;
    },
  });

  return { confirmSale };
}
