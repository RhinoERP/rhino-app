"use client";

import { ArrowLeftIcon, EyeIcon } from "@phosphor-icons/react";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type RemittancePreviewModalProps = {
  isPreviewing: boolean;
  isGenerating: boolean;
  loadPreview: () => void;
  onConfirm: () => void;
  previewHtml: string | null;
  title?: string;
};

export function RemittancePreviewModal({
  isPreviewing,
  isGenerating,
  loadPreview,
  onConfirm,
  previewHtml,
  title = "Vista previa del remito",
}: RemittancePreviewModalProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    loadPreview();
  };

  if (!open) {
    return (
      <Button
        disabled={isPreviewing}
        onClick={handleOpen}
        size="sm"
        type="button"
        variant="outline"
      >
        {isPreviewing ? (
          <>
            <Spinner className="mr-2 size-4" />
            Cargando...
          </>
        ) : (
          <>
            <EyeIcon className="mr-2 size-4" weight="bold" />
            Vista Previa
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Button
        disabled={isPreviewing}
        onClick={handleOpen}
        size="sm"
        type="button"
        variant="outline"
      >
        {isPreviewing ? (
          <>
            <Spinner className="mr-2 size-4" />
            Cargando...
          </>
        ) : (
          <>
            <EyeIcon className="mr-2 size-4" weight="bold" />
            Vista Previa
          </>
        )}
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
            disabled={!previewHtml || isGenerating}
            onClick={onConfirm}
            size="sm"
            type="button"
          >
            {isGenerating ? (
              <>
                <Spinner className="mr-2 size-4" />
                Generando...
              </>
            ) : (
              <>
                <FileText className="mr-2 size-4" />
                Confirmar y generar
              </>
            )}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-4">
          {previewHtml ? (
            <iframe
              className="h-full min-h-0 w-full max-w-[210mm] bg-white shadow-lg"
              sandbox="allow-same-origin allow-scripts"
              srcDoc={previewHtml}
              title={title}
            />
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground text-sm">
              <Spinner className="size-5" />
              <span>Generando vista previa...</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
