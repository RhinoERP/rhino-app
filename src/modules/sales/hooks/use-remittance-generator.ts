"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generateRemittanceAction } from "../actions/generate-remittance.action";

type UseRemittanceGeneratorProps = {
  orgSlug: string;
  saleId: string;
};

export function useRemittanceGenerator({
  orgSlug,
  saleId,
}: UseRemittanceGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateRemittance = async (
    type: "PRESUPUESTO" | "REMITO_FINAL"
  ): Promise<void> => {
    setIsGenerating(true);

    try {
      const result = await generateRemittanceAction(orgSlug, saleId, type);

      if (!(result.success && result.html)) {
        throw new Error(result.error ?? "Error al generar el remito");
      }

      // Generate PDF from HTML
      const filename =
        type === "PRESUPUESTO"
          ? `Presupuesto_${result.saleNumber || "sin-numero"}.pdf`
          : `Remito_${result.saleNumber || "sin-numero"}.pdf`;

      await generatePDFFromHTML(result.html, filename);

      toast.success("PDF generado correctamente");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error al generar el remito";
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateRemittance,
    isGenerating,
  };
}
