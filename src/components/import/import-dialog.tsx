"use client";

import { Download, FileArrowUp, Upload, X } from "@phosphor-icons/react";
import type * as React from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadTemplate } from "@/lib/template-generator";

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId:
    | "products"
    | "stock"
    | "customers"
    | "suppliers"
    | "historical_sales";
  templateTitle: string;
  onImport: (file: File) => Promise<{
    success: boolean;
    message: string;
    errors: string[];
    imported: number;
  }>;
  categories?: string[];
  customers?: string[];
  suppliers?: string[];
  importResult?: {
    success: boolean;
    message: string;
    errors: string[];
  } | null;
  onClearImportResult?: () => void;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Import dialog coordinates download, upload and feedback states in one place.
export function ImportDialog({
  open,
  onOpenChange,
  templateId,
  templateTitle,
  onImport,
  categories,
  customers,
  suppliers,
  importResult,
  onClearImportResult,
}: ImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDownloadTemplate = () => {
    downloadTemplate(templateId, {
      categories,
      customers,
      suppliers,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file?.name.endsWith(".xlsx")) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      return;
    }

    try {
      setIsUploading(true);
      const result = await onImport(selectedFile);
      if (result.success) {
        setSelectedFile(null);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error importing file:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    onClearImportResult?.();
    onOpenChange(false);
  };

  const helpSections = getTemplateHelpSections({
    templateId,
    categories,
    customers,
    suppliers,
  });

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar {templateTitle}</DialogTitle>
          <DialogDescription>
            Descarga la plantilla, completa los datos y luego sube el archivo
            para importar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Download Template Section */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm">
              Paso 1: Descarga la plantilla
            </h3>
            {helpSections.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-xs">Ayuda para la plantilla</p>
                  <Badge variant="secondary">
                    {helpSections.length} listas
                  </Badge>
                </div>
                <ScrollArea className="max-h-40">
                  <div className="space-y-3 pr-1">
                    {helpSections.map((section) => (
                      <div className="space-y-2" key={section.title}>
                        <p className="font-medium text-[11px] text-muted-foreground uppercase">
                          {section.title}
                        </p>
                        {section.values.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {section.values.map((value) => (
                              <span
                                className="rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                                key={`${section.title}-${value}`}
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            No hay valores disponibles.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
            <Button
              className="w-full"
              onClick={handleDownloadTemplate}
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla de {templateTitle.toLowerCase()}
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
                        setSelectedFile(null);
                      }}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Haz clic en "Importar" para continuar
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
          </div>

          {importResult ? (
            <div
              className={`space-y-3 rounded-lg border p-3 ${
                importResult.success
                  ? "border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20"
                  : "border-destructive/40 bg-destructive/10"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={`font-medium text-sm ${
                    importResult.success
                      ? "text-emerald-700"
                      : "text-destructive"
                  }`}
                >
                  {importResult.success
                    ? "Resultado de la importación"
                    : "Errores de importación"}
                </p>
                {importResult.errors.length > 0 ? (
                  <Badge
                    variant={importResult.success ? "secondary" : "destructive"}
                  >
                    {importResult.errors.length} errores
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm">{importResult.message}</p>
              {importResult.errors.length > 0 ? (
                <ScrollArea className="max-h-44 rounded-md border bg-background/70 p-2">
                  <ul className="space-y-2">
                    {importResult.errors.map((error, index) => (
                      <li
                        className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs"
                        key={`${index}-${error}`}
                      >
                        {error}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : null}
            </div>
          ) : null}

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
              disabled={!selectedFile || isUploading}
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

function getTemplateHelpSections(options: {
  templateId: ImportDialogProps["templateId"];
  categories?: string[];
  customers?: string[];
  suppliers?: string[];
}) {
  const {
    templateId,
    categories = [],
    customers = [],
    suppliers = [],
  } = options;
  const clean = (values: string[]) =>
    Array.from(
      new Set(
        values.map((value) => value.trim()).filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

  switch (templateId) {
    case "products":
      return [{ title: "Categorías válidas", values: clean(categories) }];
    case "stock":
      return [{ title: "Proveedores válidos", values: clean(suppliers) }];
    case "customers":
      return [
        {
          title: "Clientes existentes (referencia para evitar duplicados)",
          values: clean(customers),
        },
      ];
    case "suppliers":
      return [
        {
          title: "Proveedores existentes (referencia para evitar duplicados)",
          values: clean(suppliers),
        },
      ];
    default:
      return [];
  }
}
