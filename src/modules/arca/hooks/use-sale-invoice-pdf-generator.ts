"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generateSaleInvoicePdfAction } from "../actions/generate-sale-invoice-pdf.action";

type UseSaleInvoicePdfGeneratorProps = {
  orgSlug: string;
  saleId: string;
};

type SaleInvoicePdfPayload = {
  html: string;
  filename: string;
};

export function useSaleInvoicePdfGenerator({
  orgSlug,
  saleId,
}: UseSaleInvoicePdfGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const getErrorMessage = (error: unknown): string =>
    error instanceof Error
      ? error.message
      : "No se pudo generar la factura fiscal";

  const fetchInvoicePdf = async (): Promise<SaleInvoicePdfPayload> => {
    const result = await generateSaleInvoicePdfAction({
      orgSlug,
      saleId,
    });

    if (!result.success) {
      throw new Error(result.error || "No se pudo generar la factura fiscal");
    }

    return {
      html: result.html,
      filename: result.filename,
    };
  };

  const loadInvoicePdf = async (): Promise<SaleInvoicePdfPayload> => {
    setIsGenerating(true);

    try {
      return await fetchInvoicePdf();
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const generateInvoicePdf = async (): Promise<void> => {
    setIsGenerating(true);

    try {
      const result = await fetchInvoicePdf();
      await generatePDFFromHTML(result.html, result.filename);
      toast.success("Factura fiscal generada correctamente");
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    loadInvoicePdf,
    generateInvoicePdf,
    isGenerating,
  };
}
