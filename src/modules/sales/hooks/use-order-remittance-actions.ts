"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { downloadOrderRemittanceAction } from "@/modules/orders/actions/download-order-remittance.action";
import { generateOrderRemittanceAction } from "@/modules/orders/actions/generate-order-remittance.action";
import { saleDispatchProgressKey } from "../queries/query-keys";

export function useOrderRemittanceActions(params: {
  orgSlug: string;
  saleId: string;
}) {
  const { orgSlug, saleId } = params;
  const queryClient = useQueryClient();
  const [downloadingEvent, setDownloadingEvent] = useState<string | null>(null);
  const [generatingEvent, setGeneratingEvent] = useState<string | null>(null);

  const handleDownload = async (childOrderId: string, remitoNumber: string) => {
    const key = `${childOrderId}-${remitoNumber}`;
    setDownloadingEvent(key);
    try {
      const result = await downloadOrderRemittanceAction(
        orgSlug,
        childOrderId,
        remitoNumber
      );
      if (!result.success) {
        throw new Error(result.error ?? "Error al descargar el remito");
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
      toast.success("Remito descargado correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al descargar el remito"
      );
    } finally {
      setDownloadingEvent(null);
    }
  };

  const handleGenerate = async (childOrderId: string, remitoNumber: string) => {
    const key = `${childOrderId}-${remitoNumber}`;
    setGeneratingEvent(key);
    try {
      const result = await generateOrderRemittanceAction(
        orgSlug,
        childOrderId,
        remitoNumber
      );
      if (!result.success) {
        throw new Error(result.error ?? "Error al generar el remito");
      }
      toast.success("Remito generado correctamente");
      await queryClient.invalidateQueries({
        queryKey: saleDispatchProgressKey(orgSlug, saleId),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al generar el remito"
      );
    } finally {
      setGeneratingEvent(null);
    }
  };

  return {
    downloadingEvent,
    generatingEvent,
    handleDownload,
    handleGenerate,
  };
}
