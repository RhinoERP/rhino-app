"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { downloadRemittanceAction } from "../actions/download-remittance.action";
import { generateRemittanceAction } from "../actions/generate-remittance.action";
import { salesQueryKey } from "../queries/query-keys";

type UseRemittanceGeneratorProps = {
  orgSlug: string;
  saleId: string;
};

export function useRemittanceGenerator({
  orgSlug,
  saleId,
}: UseRemittanceGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const queryClient = useQueryClient();

  const generateRemittance = async (
    type: "PRESUPUESTO" | "REMITO_FINAL"
  ): Promise<void> => {
    setIsGenerating(true);

    try {
      await queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      await queryClient.refetchQueries({ queryKey: salesQueryKey(orgSlug) });

      const result = await generateRemittanceAction(orgSlug, saleId, type);

      if (!result.success) {
        throw new Error(result.error ?? "Error al generar el remito");
      }

      toast.success("Remito generado correctamente");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error al generar el remito";
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadRemittance = async (
    type: "PRESUPUESTO" | "REMITO_FINAL"
  ): Promise<void> => {
    setIsDownloading(true);

    try {
      const result = await downloadRemittanceAction(orgSlug, saleId, type);

      if (!result.success) {
        throw new Error(result.error ?? "Error al descargar el remito");
      }

      // Download the PDF
      const binary = window.atob(result.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("Remito descargado correctamente");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error al descargar el remito";
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    generateRemittance,
    downloadRemittance,
    isGenerating,
    isDownloading,
  };
}
