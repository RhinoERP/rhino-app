"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Table } from "@tanstack/react-table";
import { Percent, Trash2 } from "lucide-react";
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
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);
  const [marginValue, setMarginValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedItems = selectedRows.map((row) => row.original);

  const handleUpdateMargin = async () => {
    const margin = Number.parseFloat(marginValue);
    if (Number.isNaN(margin)) {
      return;
    }

    setIsUpdating(true);

    try {
      const response = await fetch(
        `/api/org/${orgSlug}/compras/listas-de-precios/${priceListId}/bulk-update-margin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_ids: selectedItems.map((item) => item.id),
            profit_margin: margin,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update margins");
      }

      // Invalidate and refetch the query
      await queryClient.invalidateQueries({
        queryKey: ["price-list-items", orgSlug, priceListId],
      });

      // Clear selection and close dialog
      table.toggleAllRowsSelected(false);
      setMarginDialogOpen(false);
      setMarginValue("");

      // Refresh the page
      router.refresh();
    } catch (error) {
      console.error("Error updating margins:", error);
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
        tooltip="Actualizar margen"
      >
        <Percent />
        Actualizar margen
      </DataTableActionBarAction>
      <DataTableActionBarAction
        tooltip="Eliminar seleccionados"
        variant="destructive"
      >
        <Trash2 />
        Eliminar
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
                onChange={(e) => setMarginValue(e.target.value)}
                placeholder="25"
                value={marginValue}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isUpdating}
              onClick={() => {
                setMarginDialogOpen(false);
                setMarginValue("");
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
