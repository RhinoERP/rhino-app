"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatExportDate } from "@/lib/export-utils";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generateQuotePDFAction } from "../actions/generate-quote-pdf.action";

type UseQuotePDFProps = {
  orgSlug: string;
  quoteId: string;
  customerName: string;
  createdAt: string | null;
};

export function useQuotePDF({
  orgSlug,
  quoteId,
  customerName,
  createdAt,
}: UseQuotePDFProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAndDownloadPDF = async (): Promise<void> => {
    setIsGenerating(true);
    try {
      const result = await generateQuotePDFAction(orgSlug, quoteId);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Format filename: presupuesto_dd-mm-yyyy_customerName.pdf
      const safeDate = createdAt ? createdAt : new Date().toISOString();
      const dateFormatted = formatExportDate(safeDate).replace(/\//g, "-");
      const [day, month, year] = dateFormatted.split("-");
      const dateISO = `${day ?? "00"}-${month ?? "00"}-${year ?? "0000"}`;

      // Sanitize customer name for filename
      const sanitizedName =
        (customerName || "cliente")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "")
          .substring(0, 30) || "cliente";

      const filename = `presupuesto_${dateISO}_${sanitizedName}.pdf`;

      await generatePDFFromHTML(result.html, filename);
      toast.success("Presupuesto descargado correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al descargar el presupuesto"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return { generateAndDownloadPDF, isGenerating };
}
