"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generateDebitNotePDFAction } from "../actions/generate-debit-note-pdf.action";

export function useDebitNotePDF({
  orgSlug,
  debitNoteId,
}: {
  orgSlug: string;
  debitNoteId: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const result = await generateDebitNotePDFAction(orgSlug, debitNoteId);
      if (!result.success) {
        throw new Error(result.error);
      }
      await generatePDFFromHTML(
        result.html,
        `ND_${result.debitNoteNumber ?? debitNoteId}.pdf`
      );
      toast.success("PDF generado correctamente.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo generar el PDF."
      );
    } finally {
      setIsGenerating(false);
    }
  };
  return { generatePDF, isGenerating };
}
