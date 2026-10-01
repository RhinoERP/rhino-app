"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { QuoteForm } from "@/components/quotes/quote-form";
import type { Customer } from "@/modules/customers/types";
import type { PriceLevel } from "@/modules/price-levels/types";
import { createQuoteAction } from "@/modules/quotes/actions/create-quote.action";
import { updateQuoteFileAction } from "@/modules/quotes/actions/update-quote-file.action";
import { uploadQuoteFileAction } from "@/modules/quotes/actions/upload-quote-file.action";
import type { QuoteFormValues } from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

type NewQuoteFormWrapperProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  salesPriceLists: SalesPriceList[];
  priceLevels: PriceLevel[];
};

export function NewQuoteFormWrapper({
  orgSlug,
  customers,
  products,
  salesPriceLists,
  priceLevels,
}: NewQuoteFormWrapperProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDesignFile, setSelectedDesignFile] = useState<File | null>(
    null
  );

  async function uploadFile(
    file: File,
    quoteId: string,
    type: "purchase_order" | "design"
  ): Promise<boolean> {
    const field =
      type === "purchase_order" ? "purchaseOrderFile" : "designFileUrl";
    const label = type === "purchase_order" ? "orden de compra" : "boceto";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("orgSlug", orgSlug);
    formData.append("quoteId", quoteId);
    formData.append("type", type);

    const uploadResult = await uploadQuoteFileAction(formData);
    if (uploadResult.success && uploadResult.url) {
      await updateQuoteFileAction(orgSlug, quoteId, field, uploadResult.url);
      return true;
    }
    toast.error(uploadResult.error ?? `Error al subir la ${label}`);
    return false;
  }

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

      if (
        selectedFile &&
        !(await uploadFile(selectedFile, newQuoteId, "purchase_order"))
      ) {
        return;
      }

      if (
        selectedDesignFile &&
        !(await uploadFile(selectedDesignFile, newQuoteId, "design"))
      ) {
        return;
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
      onDesignFileSelect={setSelectedDesignFile}
      onFileSelect={setSelectedFile}
      onSubmit={handleSubmit}
      orgSlug={orgSlug}
      priceLevels={priceLevels}
      products={products}
      salesPriceLists={salesPriceLists}
      selectedDesignFile={selectedDesignFile}
      selectedFile={selectedFile}
    />
  );
}
