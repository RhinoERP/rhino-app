"use client";

import { ArrowLeftIcon, PrinterIcon } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type RemittanceMaskPrintModalProps = {
  loadMask: (purchaseOrderNumber: string) => Promise<string | null>;
  title?: string;
};

/**
 * Shows the data-only remittance overlay and sends that iframe to the native
 * print dialog. The document is intentionally never downloaded or persisted.
 */
export function RemittanceMaskPrintModal({
  loadMask,
  title = "Imprimir máscara de remito",
}: RemittanceMaskPrintModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [previewedPurchaseOrderNumber, setPreviewedPurchaseOrderNumber] =
    useState("");
  const purchaseOrderInputId = useId();

  const loadPreview = async (value: string) => {
    setIsLoading(true);
    setHtml(null);

    try {
      const nextHtml = await loadMask(value);
      setHtml(nextHtml);
      if (nextHtml) {
        setPreviewedPurchaseOrderNumber(value);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openPreview = async () => {
    setPurchaseOrderNumber("");
    setPreviewedPurchaseOrderNumber("");
    setOpen(true);
    await loadPreview("");
  };

  const printMask = () => {
    const printWindow = iframeRef.current?.contentWindow;
    if (!printWindow) {
      toast.error("La máscara todavía no está lista para imprimir");
      return;
    }

    printWindow.focus();
    printWindow.print();
  };

  const needsPreviewRefresh =
    purchaseOrderNumber !== previewedPurchaseOrderNumber;

  if (!open) {
    return (
      <Button
        onClick={async (event) => {
          event.stopPropagation();
          await openPreview();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <PrinterIcon className="mr-2 size-4" weight="bold" />
        Imprimir máscara
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={async (event) => {
          event.stopPropagation();
          await openPreview();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <PrinterIcon className="mr-2 size-4" weight="bold" />
        Imprimir máscara
      </Button>

      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
          <Button
            onClick={() => setOpen(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeftIcon className="mr-2 size-4" weight="bold" />
            Volver
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <h2 className="hidden font-semibold text-sm lg:block">{title}</h2>
            <Label className="shrink-0 text-sm" htmlFor={purchaseOrderInputId}>
              O.C.
            </Label>
            <Input
              className="h-8 max-w-56"
              id={purchaseOrderInputId}
              onChange={(event) => setPurchaseOrderNumber(event.target.value)}
              placeholder="Orden de compra del cliente"
              value={purchaseOrderNumber}
            />
            <Button
              disabled={isLoading || !needsPreviewRefresh}
              onClick={() => loadPreview(purchaseOrderNumber)}
              size="sm"
              type="button"
              variant="outline"
            >
              Actualizar vista previa
            </Button>
          </div>
          <Button
            disabled={!html || isLoading || needsPreviewRefresh}
            onClick={printMask}
            size="sm"
            type="button"
          >
            <PrinterIcon className="mr-2 size-4" weight="bold" />
            Imprimir
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-4">
          {html ? (
            <iframe
              className="h-full min-h-0 w-full max-w-[210mm] bg-white shadow-lg"
              ref={iframeRef}
              sandbox="allow-same-origin allow-scripts allow-modals"
              srcDoc={html}
              title={title}
            />
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground text-sm">
              <Spinner className="size-5" />
              <span>
                {isLoading
                  ? "Preparando máscara..."
                  : "No se pudo cargar la máscara"}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
