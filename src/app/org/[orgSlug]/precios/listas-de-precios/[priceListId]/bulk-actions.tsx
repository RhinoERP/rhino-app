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

type FixedPriceUpdate =
  | { mode: "absolute"; value: number }
  | { mode: "delta"; value: number };

type UpdatePayload = {
  price?: number;
  amount_delta?: number;
  percentage?: number;
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

  const parseFixedPriceInput = (rawInput: string): FixedPriceUpdate | null => {
    const normalized = rawInput.trim().replace(",", ".");

    if (!normalized) {
      setErrorMessage("Por favor ingresa un valor válido");
      return null;
    }

    const isRelative = normalized.startsWith("+") || normalized.startsWith("-");
    const parsed = Number.parseFloat(normalized);

    if (Number.isNaN(parsed)) {
      setErrorMessage("Por favor ingresa un valor válido");
      return null;
    }

    if (isRelative) {
      const hasNegativeResult = selectedItems.some((item) => {
        const currentPrice = item.purchase_price ?? item.price ?? 0;
        return currentPrice + parsed < 0;
      });

      if (hasNegativeResult) {
        setErrorMessage(
          "El ajuste no puede dejar el precio final por debajo de 0"
        );
        return null;
      }

      return { mode: "delta", value: parsed };
    }

    if (parsed < 0) {
      setErrorMessage("El precio debe ser mayor o igual a 0");
      return null;
    }

    return { mode: "absolute", value: parsed };
  };

  const buildUpdatePayload = (
    parsedValue: number,
    fixedUpdate: FixedPriceUpdate | null
  ): UpdatePayload | null => {
    if (updateType === "percentage") {
      const validationError = validatePriceUpdate(parsedValue);
      if (validationError) {
        setErrorMessage(validationError);
        return null;
      }

      return { percentage: parsedValue };
    }

    if (!fixedUpdate) {
      return null;
    }

    if (fixedUpdate.mode === "absolute") {
      return { price: fixedUpdate.value };
    }

    return { amount_delta: fixedUpdate.value };
  };

  const sendPriceUpdate = async (payload: UpdatePayload) =>
    fetch(
      `/api/org/${orgSlug}/precios/listas-de-precios/${priceListId}/bulk-update-price`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: selectedItems.map((item) => item.id),
          ...payload,
        }),
      }
    );

  const handleUpdateSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["price-list-items", orgSlug, priceListId],
    });

    table.toggleAllRowsSelected(false);
    setPriceDialogOpen(false);
    setPriceValue("");
    setErrorMessage(null);
    router.refresh();
  };

  const handleUpdatePrice = async () => {
    const parsedValue = Number.parseFloat(priceValue);
    const fixedUpdate =
      updateType === "fixed" ? parseFixedPriceInput(priceValue) : null;
    const payload = buildUpdatePayload(parsedValue, fixedUpdate);

    if (!payload) {
      return;
    }

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const response = await sendPriceUpdate(payload);

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(
          errorPayload.error || "No se pudo actualizar los precios"
        );
      }

      await handleUpdateSuccess();
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
                placeholder={
                  updateType === "fixed" ? "1500.00, +100, -50" : "5"
                }
                value={priceValue}
              />
              {updateType === "fixed" && (
                <p className="text-muted-foreground text-xs">
                  Usa un valor absoluto para reemplazar (ej: 1500), o{" "}
                  <code>+100</code>/<code>-50</code> para sumar o restar sobre
                  el precio actual.
                </p>
              )}
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
