"use client";

import { useMutation } from "@tanstack/react-query";
import { createDirectSaleAction } from "../actions/create-direct-sale.action";
import type { CreateDirectSaleInput } from "../types";

export function useDirectSaleMutation(orgSlug: string) {
  const createDirectSale = useMutation({
    mutationFn: async (payload: Omit<CreateDirectSaleInput, "orgSlug">) => {
      const result = await createDirectSaleAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(
          result.error || "No se pudo registrar la venta directa"
        );
      }

      return result;
    },
  });

  return { createDirectSale };
}
