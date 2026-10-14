"use client";

import { useState } from "react";
import { toast } from "sonner";
import { downloadRemittanceAction } from "../actions/download-remittance.action";
import { generateRemittanceAction } from "../actions/generate-remittance.action";
import { previewRemittanceAction } from "../actions/preview-remittance.action";
import { previewRemittanceMaskAction } from "../actions/preview-remittance-mask.action";

type UseRemittanceGeneratorProps = {
  orgSlug: string;
  saleId: string;
};

export function downloadGeneratedPdf(pdf: {
  filename: string;
  pdfBase64: string;
}): void {
  const binary = window.atob(pdf.pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = pdf.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useRemittanceGenerator({
  orgSlug,
  saleId,
}: UseRemittanceGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const generateRemittance = async (
    type: "PRESUPUESTO" | "REMITO_FINAL"
  ): Promise<{
    fallbackPdf?: { filename: string; pdfBase64: string };
    storageError?: string;
  }> => {
    setIsGenerating(true);

    try {
      const result = await generateRemittanceAction(orgSlug, saleId, type);

      if (!result.success) {
        throw new Error(result.error ?? "Error al generar el remito");
      }

      if (result.storageError) {
        toast.warning(
          `El PDF se generó pero no quedó guardado: ${result.storageError}. Descargalo antes de salir de esta pantalla.`
        );
      } else {
        toast.success("Remito generado correctamente");
      }
      return {
        fallbackPdf: result.fallbackPdf,
        storageError: result.storageError,
      };
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

      downloadGeneratedPdf(result);

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

  const previewRemittance = async (
    type: "PRESUPUESTO" | "REMITO_FINAL"
  ): Promise<string | null> => {
    setIsPreviewing(true);

    try {
      const result = await previewRemittanceAction(orgSlug, saleId, type);

      if (!result.success) {
        throw new Error(result.error ?? "Error al generar la vista previa");
      }

      return result.html;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error al generar la vista previa";
      toast.error(errorMessage);
      return null;
    } finally {
      setIsPreviewing(false);
    }
  };

  const previewRemittanceMask = async (
    purchaseOrderNumber = ""
  ): Promise<string | null> => {
    try {
      const result = await previewRemittanceMaskAction(
        orgSlug,
        saleId,
        purchaseOrderNumber
      );

      if (!result.success) {
        throw new Error(
          result.error ?? "Error al generar la máscara de remito"
        );
      }

      return result.html;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al generar la máscara de remito"
      );
      return null;
    }
  };

  return {
    generateRemittance,
    downloadRemittance,
    previewRemittance,
    previewRemittanceMask,
    isGenerating,
    isDownloading,
    isPreviewing,
  };
}
