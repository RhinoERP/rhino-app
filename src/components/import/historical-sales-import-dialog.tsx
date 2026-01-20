"use client";

import { Download, FileArrowUp, Upload, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseHistoricalSalesExcel } from "@/lib/historical-sales-parser";
import { downloadTemplate } from "@/lib/template-generator";
import type { HistoricalSalesRowData } from "@/modules/sales/historical/types";
import { HistoricalSalesPreview } from "./historical-sales-preview";

type HistoricalSalesImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: HistoricalSalesRowData[]) => Promise<void>;
};

export function HistoricalSalesImportDialog({
  open,
  onOpenChange,
  onImport,
}: HistoricalSalesImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<HistoricalSalesRowData[] | null>(
    null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    downloadTemplate("historical_sales");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file?.name.endsWith(".xlsx")) {
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setParsedData(null);

    // Parse file immediately to show preview
    const result = await parseHistoricalSalesExcel(file);

    if (result.success && result.data) {
      setParsedData(result.data);
    } else {
      setParseError(result.error || "Error al procesar el archivo");
    }
  };

  const handleImport = async () => {
    if (!parsedData) {
      return;
    }

    try {
      setIsUploading(true);
      await onImport(parsedData);
      handleClose();
    } catch (error) {
      console.error("Error importing file:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
    onOpenChange(false);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setParsedData(null);
    setParseError(null);
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar Ventas Históricas</DialogTitle>
          <DialogDescription>
            Descarga la plantilla, completa los datos agregados por mes y luego
            sube el archivo para importar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Download Template Section */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm">
              Paso 1: Descarga la plantilla
            </h3>
            <Button
              className="w-full"
              onClick={handleDownloadTemplate}
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla de ventas históricas
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Luego
              </span>
            </div>
          </div>

          {/* Upload File Section */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Paso 2: Sube tu archivo</h3>

            {/* Drag and Drop Area */}
            {/* biome-ignore lint/a11y/useSemanticElements: Drag and drop area requires div wrapper */}
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
            >
              <input
                accept=".xlsx"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                id="file-upload"
                onChange={handleFileChange}
                type="file"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                    <FileArrowUp className="h-5 w-5 text-primary" />
                    <span className="font-medium text-sm">
                      {selectedFile.name}
                    </span>
                    <button
                      className="ml-2 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile();
                      }}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {parseError && "Error al procesar"}
                    {!parseError &&
                      parsedData &&
                      "Archivo procesado correctamente"}
                    {!(parseError || parsedData) && "Procesando..."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-medium text-primary">
                        Haz clic para seleccionar
                      </span>{" "}
                      o arrastra tu archivo aquí
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Solo archivos .xlsx
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {parseError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-destructive text-sm">{parseError}</p>
              </div>
            )}
          </div>

          {/* Preview Section */}
          {parsedData && <HistoricalSalesPreview data={parsedData} />}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handleClose}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!parsedData || isUploading}
              onClick={handleImport}
              type="button"
            >
              {isUploading ? "Importando..." : "Importar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
