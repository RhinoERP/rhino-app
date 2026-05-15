"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  downloadSaleInvoicePdfAction,
  generateSaleInvoicePdfAction,
} from "../actions/generate-sale-invoice-pdf.action";

type UseSaleInvoicePdfGeneratorProps = {
  orgSlug: string;
  saleId: string;
};

type SaleInvoicePdfPayload = {
  html: string;
  filename: string;
};

function downloadBase64Pdf(pdfBase64: string, filename: string): void {
  const binary = window.atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
      const result = await downloadSaleInvoicePdfAction({
        orgSlug,
        saleId,
      });

      if (!result.success) {
        throw new Error(result.error || "No se pudo generar la factura fiscal");
      }

      downloadBase64Pdf(result.pdfBase64, result.filename);
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
