"use client";

import type { Table } from "@tanstack/react-table";
import { Percent } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from "@/components/data-table/data-table-action-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { StockItem } from "@/modules/inventory/types";

type StockBulkActionsProps = {
  orgSlug: string;
  table: Table<StockItem>;
};

export function StockBulkActions({ orgSlug, table }: StockBulkActionsProps) {
  const router = useRouter();
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);
  const [marginValue, setMarginValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedItems = selectedRows.map((row) => row.original);

  const handleUpdateMargin = async () => {
    const margin = Number.parseFloat(marginValue);
    if (Number.isNaN(margin)) {
      setErrorMessage("Por favor ingresa un margen válido");
      return;
    }

    if (margin < 0) {
      setErrorMessage("El margen debe ser mayor o igual a 0");
      return;
    }

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/org/${orgSlug}/products/bulk-update-margin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_ids: selectedItems.map((item) => item.product_id),
            profit_margin: margin,
          }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload.error || "No se pudo actualizar el margen de ganancia"
        );
      }

      // Clear selection and close dialog
      table.toggleAllRowsSelected(false);
      setMarginDialogOpen(false);
      setMarginValue("");
      setErrorMessage(null);

      // Refresh the page
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar el margen";
      setErrorMessage(message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <DataTableActionBarSelection table={table} />
      <Separator className="h-5" orientation="vertical" />
      <DataTableActionBarAction
        onClick={() => setMarginDialogOpen(true)}
        tooltip="Actualizar margen de ganancia"
      >
        <Percent />
        Actualizar margen
      </DataTableActionBarAction>

      <Dialog onOpenChange={setMarginDialogOpen} open={marginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar margen de ganancia</DialogTitle>
            <DialogDescription>
              Actualizar el margen de ganancia para {selectedItems.length}{" "}
              {selectedItems.length === 1 ? "producto" : "productos"}{" "}
              seleccionados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="margin">Nuevo margen (%)</Label>
              <Input
                disabled={isUpdating}
                id="margin"
                inputMode="decimal"
                onChange={(e) => {
                  setMarginValue(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="25"
                value={marginValue}
              />
            </div>
            {errorMessage && (
              <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-900/20 dark:text-red-400">
                {errorMessage}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={isUpdating}
              onClick={() => {
                setMarginDialogOpen(false);
                setMarginValue("");
                setErrorMessage(null);
              }}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isUpdating || !marginValue}
              onClick={handleUpdateMargin}
            >
              {isUpdating ? "Actualizando..." : "Actualizar margen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
