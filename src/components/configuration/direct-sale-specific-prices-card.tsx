"use client";

import { Download, FileArrowUp, Tag, Upload, X } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type * as React from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DirectSaleTemplateProduct } from "@/modules/inventory/types";
import { exportDirectSaleTemplate } from "@/modules/inventory/utils/export-direct-sales-template";
import { importDirectSalePricesAction } from "@/modules/organizations/actions/import-direct-sale-prices.action";

type DirectSaleSpecificPricesCardProps = {
  orgSlug: string;
  products: DirectSaleTemplateProduct[];
};

export function DirectSaleSpecificPricesCard({
  orgSlug,
  products,
}: DirectSaleSpecificPricesCardProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const importPrices = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      return importDirectSalePricesAction(orgSlug, formData);
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error ?? "No se pudieron importar los precios");
        return;
      }

      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["direct-sale-products", orgSlug],
        }),
        queryClient.invalidateQueries({ queryKey: ["products", orgSlug] }),
      ]);

      if (result.errors.length > 0) {
        toast.warning(`${result.processed} precios procesados correctamente.`, {
          description: `${result.errors.length} filas no se importaron.`,
        });
        return;
      }

      toast.success(`${result.processed} precios procesados correctamente.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron importar los precios"
      );
    },
  });

  const handleDownloadTemplate = async () => {
    try {
      await exportDirectSaleTemplate(products, orgSlug);
    } catch (_error) {
      toast.error("No se pudo descargar la plantilla");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(event.type === "dragenter" || event.type === "dragover");
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);

    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    if (!(file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      toast.error("El archivo debe ser Excel (.xlsx o .xls)");
      return;
    }

    setSelectedFile(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Tag className="size-5" weight="duotone" />
              Precios específicos por producto
            </CardTitle>
            <CardDescription>
              Define precios fijos para productos puntuales mediante una carga
              masiva de Excel.
            </CardDescription>
          </div>
          <Button
            disabled={products.length === 0 || importPrices.isPending}
            onClick={handleDownloadTemplate}
            type="button"
            variant="outline"
          >
            <Download className="mr-2 size-4" />
            Descargar plantilla
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border bg-muted/30 p-4 text-muted-foreground text-sm">
          Si un producto tiene precio manual, la Venta Directa usará ese valor e
          ignorará el porcentaje de recargo global.
        </div>

        <input
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
          ref={inputRef}
          type="file"
        />

        <button
          className={cn(
            "w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          type="button"
        >
          {selectedFile ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex max-w-full items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                <FileArrowUp className="size-5 shrink-0 text-primary" />
                <span className="truncate font-medium text-sm">
                  {selectedFile.name}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Listo para importar.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="font-medium text-primary">
                    Haz clic para seleccionar
                  </span>{" "}
                  o arrastra tu archivo aquí
                </p>
                <p className="text-muted-foreground text-xs">
                  Solo archivos .xlsx o .xls
                </p>
              </div>
            </div>
          )}
        </button>

        <div className="flex justify-end gap-2">
          <Button
            disabled={!selectedFile || importPrices.isPending}
            onClick={clearSelectedFile}
            type="button"
            variant="outline"
          >
            <X className="mr-2 size-4" />
            Quitar archivo
          </Button>
          <Button
            disabled={!selectedFile || importPrices.isPending}
            onClick={() => {
              if (selectedFile) {
                importPrices.mutate(selectedFile);
              }
            }}
            type="button"
          >
            <FileArrowUp className="mr-2 size-4" />
            {importPrices.isPending
              ? "Subiendo..."
              : "Subir precios actualizados"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
