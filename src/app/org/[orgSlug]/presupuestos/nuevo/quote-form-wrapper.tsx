"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { QuoteForm } from "@/components/quotes/quote-form";
import type { Customer } from "@/modules/customers/types";
import { createQuoteAction } from "@/modules/quotes/actions/create-quote.action";
import type { QuoteFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

type NewQuoteFormWrapperProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  salesPriceLists: SalesPriceList[];
};

export function NewQuoteFormWrapper({
  orgSlug,
  customers,
  products,
  salesPriceLists,
}: NewQuoteFormWrapperProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: QuoteFormValues) => {
    setIsSubmitting(true);

    try {
      const result = await createQuoteAction(orgSlug, values);

      if (result.success && result.quoteId) {
        toast.success("Presupuesto creado exitosamente");
        router.push(`/org/${orgSlug}/listas-de-presupuestos`);
      } else {
        toast.error(
          result.error ?? "Error desconocido al crear el presupuesto"
        );
      }
    } catch (_error) {
      toast.error("Error al procesar el presupuesto");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <QuoteForm
      customers={customers}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      orgSlug={orgSlug}
      products={products}
      salesPriceLists={salesPriceLists}
    />
  );
}
