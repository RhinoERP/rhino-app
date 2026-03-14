"use client";

import { useMutation } from "@tanstack/react-query";
import { createPosSaleAction } from "../actions/create-pos-sale.action";
import type { CreatePosSaleInput } from "../types";

export function useCreatePosSaleMutation(orgSlug: string) {
  const createPosSale = useMutation({
    mutationFn: async (payload: Omit<CreatePosSaleInput, "orgSlug">) => {
      const result = await createPosSaleAction({
        orgSlug,
        ...payload,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo registrar la venta POS.");
      }

      return result;
    },
  });

  return {
    createPosSale,
  };
}
