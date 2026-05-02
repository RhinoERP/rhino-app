"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generateCreditNotePDFAction } from "../actions/generate-credit-note-pdf.action";

type UseCreditNotePDFProps = {
  orgSlug: string;
  creditNoteId: string;
};

export function useCreditNotePDF({
  orgSlug,
  creditNoteId,
}: UseCreditNotePDFProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async (): Promise<void> => {
    setIsGenerating(true);
    try {
      const result = await generateCreditNotePDFAction(orgSlug, creditNoteId);

      if (!result.success) {
        throw new Error(result.error);
      }

      const filename = `NC_${result.creditNoteNumber ?? creditNoteId}.pdf`;
      await generatePDFFromHTML(result.html, filename);
      toast.success("PDF generado correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al generar el PDF"
      );
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePDF, isGenerating };
}
