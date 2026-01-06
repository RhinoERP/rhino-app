"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Table } from "@tanstack/react-table";
import { DollarSign, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { PriceListItem } from "@/modules/price-lists/types";

type PriceListItemsBulkActionsProps = {
  orgSlug: string;
  priceListId: string;
  table: Table<PriceListItem>;
};

export function PriceListItemsBulkActions({
  orgSlug,
  priceListId,
  table,
}: PriceListItemsBulkActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceValue, setPriceValue] = useState("");
  const [updateType, setUpdateType] = useState<"fixed" | "percentage">("fixed");
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedItems = selectedRows.map((row) => row.original);

  const validatePriceUpdate = (value: number): string | null => {
    if (Number.isNaN(value)) {
      return "Por favor ingresa un valor válido";
    }

    if (updateType === "fixed" && value < 0) {
      return "El precio debe ser mayor o igual a 0";
    }

    if (updateType === "percentage" && value <= -100) {
      return "El porcentaje debe ser mayor a -100%";
    }

    return null;
  };

  const handleUpdatePrice = async () => {
    const value = Number.parseFloat(priceValue);
    const validationError = validatePriceUpdate(value);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/org/${orgSlug}/precios/listas-de-precios/${priceListId}/bulk-update-price`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_ids: selectedItems.map((item) => item.id),
            price: updateType === "fixed" ? value : undefined,
            percentage: updateType === "percentage" ? value : undefined,
          }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo actualizar los precios");
      }

      // Invalidate and refetch the query
      await queryClient.invalidateQueries({
        queryKey: ["price-list-items", orgSlug, priceListId],
      });

      // Clear selection and close dialog
      table.toggleAllRowsSelected(false);
      setPriceDialogOpen(false);
      setPriceValue("");
      setErrorMessage(null);

      // Refresh the page
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido al actualizar los precios";
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
        onClick={() => setPriceDialogOpen(true)}
        tooltip="Actualizar precio"
      >
        <DollarSign />
        Actualizar precio
      </DataTableActionBarAction>
      <DataTableActionBarAction
        tooltip="Eliminar seleccionados"
        variant="destructive"
      >
        <Trash2 />
        Eliminar
      </DataTableActionBarAction>

      <Dialog onOpenChange={setPriceDialogOpen} open={priceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar precio</DialogTitle>
            <DialogDescription>
              Actualizar el precio para {selectedItems.length}{" "}
              {selectedItems.length === 1 ? "producto" : "productos"}{" "}
              seleccionados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="update-type">Tipo de actualización</Label>
              <Select
                disabled={isUpdating}
                onValueChange={(value) =>
                  setUpdateType(value as "fixed" | "percentage")
                }
                value={updateType}
              >
                <SelectTrigger id="update-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Precio fijo</SelectItem>
                  <SelectItem value="percentage">Porcentaje</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">
                {updateType === "fixed"
                  ? "Nuevo precio ($)"
                  : "Porcentaje de cambio (%)"}
              </Label>
              <Input
                disabled={isUpdating}
                id="price"
                inputMode="decimal"
                onChange={(e) => {
                  setPriceValue(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder={updateType === "fixed" ? "1500.00" : "5"}
                value={priceValue}
              />
              {updateType === "percentage" && (
                <p className="text-muted-foreground text-xs">
                  Ejemplo: 5 aumenta el precio un 5%, -10 lo reduce un 10%
                </p>
              )}
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
                setPriceDialogOpen(false);
                setPriceValue("");
                setErrorMessage(null);
              }}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isUpdating || !priceValue}
              onClick={handleUpdatePrice}
            >
              {isUpdating ? "Actualizando..." : "Actualizar precio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
