"use client";

import { useMutation } from "@tanstack/react-query";
import { dispatchSaleAction } from "../actions/dispatch-sale.action";
import type { DispatchSaleOrderInput } from "../types";

export function useDispatchSaleMutation() {
  const dispatchSale = useMutation({
    mutationFn: async (payload: DispatchSaleOrderInput) => {
      const result = await dispatchSaleAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo despachar la venta");
      }

      return result;
    },
  });

  return { dispatchSale };
}
