"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { convertQuoteAction } from "../actions/convert-quote.action";

export function useConvertQuote(orgSlug: string) {
  const router = useRouter();

  const convertQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      const result = await convertQuoteAction(quoteId, orgSlug);

      if (!result.success) {
        throw new Error(result.error || "Error al convertir el presupuesto");
      }

      return result;
    },
    onSuccess: () => {
      toast.success("Presupuesto convertido a nota de venta correctamente");
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al convertir el presupuesto"
      );
    },
  });

  return { convertQuote };
}
