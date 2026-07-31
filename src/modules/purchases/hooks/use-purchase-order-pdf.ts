"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import { generatePurchaseOrderPDFAction } from "../actions/generate-purchase-order-pdf.action";

type UsePurchaseOrderPDFProps = {
  orgSlug: string;
  purchaseOrderId: string;
};

export function usePurchaseOrderPDF({
  orgSlug,
  purchaseOrderId,
}: UsePurchaseOrderPDFProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAndDownloadPDF = async (): Promise<void> => {
    setIsGenerating(true);
    try {
      const result = await generatePurchaseOrderPDFAction(
        orgSlug,
        purchaseOrderId
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      const number =
        result.purchaseNumber?.toString().padStart(6, "0") ?? "sin-numero";
      const filename = `orden-de-compra-${number}.pdf`;

      await generatePDFFromHTML(result.html, filename);
      toast.success("Orden de compra descargada correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al descargar la orden de compra"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return { generateAndDownloadPDF, isGenerating };
}
