"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { QuoteForm } from "@/components/quotes/quote-form";
import type { Customer } from "@/modules/customers/types";
import { createQuoteAction } from "@/modules/quotes/actions/create-quote.action";
import { updateQuoteFileAction } from "@/modules/quotes/actions/update-quote-file.action";
import { uploadPurchaseOrderFileAction } from "@/modules/quotes/actions/upload-purchase-order-file.action";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = async (values: QuoteFormValues) => {
    setIsSubmitting(true);

    try {
      const result = await createQuoteAction(orgSlug, values);

      if (!result.success) {
        toast.error(
          result.error ?? "Error desconocido al crear el presupuesto"
        );
        return;
      }
      const newQuoteId = result.quoteId;
      if (!newQuoteId) {
        toast.error("Error al obtener el ID del presupuesto");
        return;
      }

      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("orgSlug", orgSlug);
        formData.append("quoteId", newQuoteId);

        const uploadResult = await uploadPurchaseOrderFileAction(formData);
        if (uploadResult.success && uploadResult.url) {
          await updateQuoteFileAction(orgSlug, newQuoteId, uploadResult.url);
        } else {
          toast.error(
            uploadResult.error ?? "Error al subir la orden de compra"
          );
          return;
        }
      }

      toast.success("Presupuesto creado exitosamente");
      router.push(`/org/${orgSlug}/listas-de-presupuestos`);
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
      onFileSelect={setSelectedFile}
      onSubmit={handleSubmit}
      orgSlug={orgSlug}
      products={products}
      salesPriceLists={salesPriceLists}
      selectedFile={selectedFile}
    />
  );
}
