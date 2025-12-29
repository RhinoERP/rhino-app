"use client";

import { useMutation } from "@tanstack/react-query";
import { deliverSaleAction } from "../actions/deliver-sale.action";
import type { DeliverSaleOrderInput } from "../types";

export function useDeliverSaleMutation() {
  const deliverSale = useMutation({
    mutationFn: async (payload: DeliverSaleOrderInput) => {
      const result = await deliverSaleAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo marcar como entregada");
      }

      return result;
    },
  });

  return { deliverSale };
}
