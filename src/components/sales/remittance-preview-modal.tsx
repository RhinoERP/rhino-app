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
  onConfirm: () => Promise<boolean>;
  onDownloadFallback?: () => void;
  storageError?: string | null;
  previewHtml: string | null;
  title?: string;
};

export function RemittancePreviewModal({
  isPreviewing,
  isGenerating,
  loadPreview,
  onConfirm,
  onDownloadFallback,
  storageError,
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
          {storageError && onDownloadFallback ? (
            <Button onClick={onDownloadFallback} size="sm" type="button">
              <FileText className="mr-2 size-4" />
              Descargar PDF
            </Button>
          ) : (
            <Button
              disabled={!previewHtml || isGenerating}
              onClick={async () => {
                if (await onConfirm()) {
                  setOpen(false);
                }
              }}
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
          )}
        </div>
        {storageError && (
          <p
            className="border-b px-6 py-2 text-destructive text-sm"
            role="alert"
          >
            El PDF se generó, pero no quedó guardado: {storageError}. Descargalo
            antes de salir de esta página.
          </p>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted p-4">
          {previewHtml && (
            <iframe
              className="h-full min-h-0 w-full max-w-[210mm] bg-white shadow-lg"
              sandbox="allow-same-origin allow-scripts"
              srcDoc={previewHtml}
              title={title}
            />
          )}
          {!previewHtml && isPreviewing && (
            <div className="flex items-center gap-3 text-muted-foreground text-sm">
              <Spinner className="size-5" />
              <span>Generando vista previa...</span>
            </div>
          )}
          {!(previewHtml || isPreviewing) && (
            <div className="space-y-3 text-center text-muted-foreground text-sm">
              <p>No se pudo cargar la vista previa.</p>
              <Button onClick={loadPreview} size="sm" variant="outline">
                Reintentar
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
