"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { emitBulkSaleInvoicesAction } from "../actions/emit-bulk-sale-invoices.action";

export function useEmitBulkSaleInvoicesMutation() {
  const router = useRouter();

  const emitBulkSaleInvoices = useMutation({
    mutationFn: async (payload: {
      orgSlug: string;
      sales: Array<{
        saleId: string;
        saleNumber?: string | null;
        customerName?: string | null;
      }>;
    }) => {
      const result = await emitBulkSaleInvoicesAction(payload);

      if (!result.success) {
        throw new Error(
          result.error || "No se pudieron emitir las facturas en ARCA"
        );
      }

      return result.data;
    },
    onSettled: () => {
      router.refresh();
    },
  });

  return { emitBulkSaleInvoices };
}
