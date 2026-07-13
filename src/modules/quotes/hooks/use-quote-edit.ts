"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateQuoteAction } from "../actions/update-quote.action";
import type { QuoteFormValues } from "../types";

export function useEditQuote(orgSlug: string, quoteId: string) {
  const router = useRouter();

  const editQuote = useMutation({
    mutationFn: async (values: QuoteFormValues) => {
      const result = await updateQuoteAction(orgSlug, quoteId, values);

      if (!result.success) {
        throw new Error(result.error || "Error al actualizar el presupuesto");
      }

      return result;
    },
    onSuccess: () => {
      toast.success("Presupuesto actualizado correctamente");
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al actualizar el presupuesto"
      );
    },
  });

  return { editQuote, isPending: editQuote.isPending };
}
