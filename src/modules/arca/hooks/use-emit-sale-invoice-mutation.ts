"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { emitSaleInvoiceAction } from "../actions/emit-sale-invoice.action";

export function useEmitSaleInvoiceMutation() {
  const router = useRouter();

  const emitSaleInvoice = useMutation({
    mutationFn: async (payload: { orgSlug: string; saleId: string }) => {
      const result = await emitSaleInvoiceAction(payload);

      if (!result.success) {
        throw new Error(result.error || "No se pudo emitir la factura en ARCA");
      }

      return result.data;
    },
    onSettled: () => {
      router.refresh();
    },
  });

  return { emitSaleInvoice };
}
