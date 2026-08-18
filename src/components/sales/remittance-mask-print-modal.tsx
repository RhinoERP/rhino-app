"use client";

import { ArrowLeftIcon, PrinterIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type RemittanceMaskPrintModalProps = {
  loadMask: () => Promise<string | null>;
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

  const openPreview = async () => {
    setOpen(true);
    setIsLoading(true);
    setHtml(null);

    try {
      setHtml(await loadMask());
    } finally {
      setIsLoading(false);
    }
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
        <div className="flex items-center justify-between border-b px-6 py-3">
          <Button
            onClick={() => setOpen(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeftIcon className="mr-2 size-4" weight="bold" />
            Volver
          </Button>
          <h2 className="font-semibold text-sm">{title}</h2>
          <Button
            disabled={!html || isLoading}
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
              sandbox="allow-same-origin allow-scripts"
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
