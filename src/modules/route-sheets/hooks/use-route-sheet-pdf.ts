"use client";

import { useState } from "react";
import { toast } from "sonner";
import { downloadRouteSheetAction } from "../actions/download-route-sheet.action";

export function useRouteSheetPdf({ orgSlug }: { orgSlug: string }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadRouteSheet = async (routeSheetId: string): Promise<void> => {
    setIsDownloading(true);

    try {
      const result = await downloadRouteSheetAction(orgSlug, routeSheetId);

      if (!result.success) {
        throw new Error(result.error ?? "Error al descargar la hoja de ruta");
      }

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

      toast.success("Hoja de ruta descargada correctamente");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error al descargar la hoja de ruta";
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    downloadRouteSheet,
    isDownloading,
  };
}
