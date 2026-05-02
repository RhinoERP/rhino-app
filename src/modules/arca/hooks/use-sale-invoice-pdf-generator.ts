"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generateSaleInvoicePdfAction } from "../actions/generate-sale-invoice-pdf.action";

type UseSaleInvoicePdfGeneratorProps = {
  orgSlug: string;
  saleId: string;
};

export function useSaleInvoicePdfGenerator({
  orgSlug,
  saleId,
}: UseSaleInvoicePdfGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInvoicePdf = async (): Promise<void> => {
    setIsGenerating(true);

    try {
      const result = await generateSaleInvoicePdfAction({
        orgSlug,
        saleId,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo generar la factura fiscal");
      }

      await generatePDFFromHTML(result.html, result.filename);
      toast.success("Factura fiscal generada correctamente");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "No se pudo generar la factura fiscal";

      toast.error(errorMessage);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateInvoicePdf,
    isGenerating,
  };
}
