"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useSaleInvoicePdfGenerator } from "@/modules/arca/hooks/use-sale-invoice-pdf-generator";

type ArcaInvoiceDownloadButtonProps = {
  orgSlug: string;
  saleId: string;
};

export function ArcaInvoiceDownloadButton({
  orgSlug,
  saleId,
}: ArcaInvoiceDownloadButtonProps) {
  const { generateInvoicePdf, isGenerating } = useSaleInvoicePdfGenerator({
    orgSlug,
    saleId,
  });

  return (
    <Button
      disabled={isGenerating}
      onClick={async () => {
        await generateInvoicePdf();
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <DownloadSimpleIcon className="mr-2 size-4" weight="bold" />
      {isGenerating ? "Descargando..." : "Descargar"}
    </Button>
  );
}
