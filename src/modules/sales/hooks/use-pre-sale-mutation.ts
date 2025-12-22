"use client";

import { useMutation } from "@tanstack/react-query";
import { createPreSaleAction } from "../actions/create-pre-sale.action";
import type { CreatePreSaleOrderInput } from "../types";

export function usePreSaleMutation(orgSlug: string) {
  const createPreSale = useMutation({
    mutationFn: async (payload: Omit<CreatePreSaleOrderInput, "orgSlug">) => {
      const result = await createPreSaleAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo crear la preventa");
      }

      return result;
    },
  });

  return { createPreSale };
}
