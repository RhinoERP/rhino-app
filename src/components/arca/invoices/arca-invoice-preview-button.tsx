"use client";

import { EyeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSaleInvoicePdfGenerator } from "@/modules/arca/hooks/use-sale-invoice-pdf-generator";

type ArcaInvoicePreviewButtonProps = {
  orgSlug: string;
  saleId: string;
  invoiceNumber?: string | null;
};

export function ArcaInvoicePreviewButton({
  orgSlug,
  saleId,
  invoiceNumber,
}: ArcaInvoicePreviewButtonProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const { isGenerating, loadInvoicePdf } = useSaleInvoicePdfGenerator({
    orgSlug,
    saleId,
  });

  const title = invoiceNumber?.trim()
    ? `Vista previa ${invoiceNumber}`
    : "Vista previa de factura";

  const description =
    "Se muestra el mismo HTML fiscal que se usa para generar el PDF.";

  const loadPreview = () => {
    if (previewHtml || isGenerating) {
      return;
    }

    loadInvoicePdf()
      .then((result) => {
        setPreviewHtml(result.html);
      })
      .catch(() => {
        setOpen(false);
      });
  };

  const handleOpen = () => {
    setOpen(true);
    loadPreview();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      loadPreview();
    }
  };

  const previewContent = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {previewHtml ? (
        <iframe
          className="h-full min-h-0 w-full bg-white"
          sandbox="allow-same-origin"
          srcDoc={previewHtml}
          title={title}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <Spinner className="size-5" />
            <span>
              {isGenerating
                ? "Cargando vista previa..."
                : "Preparando factura..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Button onClick={handleOpen} size="sm" type="button" variant="outline">
          <EyeIcon className="mr-2 size-4" weight="bold" />
          Ver
        </Button>

        <Sheet onOpenChange={handleOpenChange} open={open}>
          <SheetContent
            className="h-[92dvh] w-full gap-0 p-0 sm:max-w-none"
            side="bottom"
          >
            <SheetHeader className="border-b px-4 py-3 text-left">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            {previewContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm" type="button" variant="outline">
        <EyeIcon className="mr-2 size-4" weight="bold" />
        Ver
      </Button>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="flex h-[90dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {previewContent}
        </DialogContent>
      </Dialog>
    </>
  );
}
