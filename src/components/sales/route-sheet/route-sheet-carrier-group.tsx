"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { useRouteSheets } from "@/modules/route-sheets/hooks/use-route-sheets";
import { useRouteSheetMutations } from "@/modules/route-sheets/hooks/use-route-sheets-mutations";
import type {
  RouteSheetSale,
  RouteSheetWithSales,
} from "@/modules/route-sheets/types";
import { RouteSheetHeader } from "./route-sheet-header";
import { RouteSheetSaleRow } from "./route-sheet-sale-row";

type RouteSheetCarrierGroupProps = {
  orgSlug: string;
  routeSheet: RouteSheetWithSales;
};

type AddSalesDialogProps = {
  orgSlug: string;
  routeSheet: RouteSheetWithSales;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function AddSalesDialog({
  orgSlug,
  routeSheet,
  open,
  onOpenChange,
}: AddSalesDialogProps) {
  const { data } = useRouteSheets(orgSlug);
  const { addSales } = useRouteSheetMutations(orgSlug);
  const availableSales = data?.availableSales ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [remittances, setRemittances] = useState<Record<string, string>>({});
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedIds(new Set());
    setRemittances({});
    setErrorMessage(null);
    getRemittanceSettings(orgSlug).then((settings) => {
      setAutoEnabled(Boolean(settings.success && settings.data?.autoEnabled));
    });
  }, [open, orgSlug]);

  const toggleSale = (sale: RouteSheetSale) => {
    const isAdding = !selectedIds.has(sale.id);

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sale.id)) {
        next.delete(sale.id);
      } else {
        next.add(sale.id);
      }
      return next;
    });

    if (
      isAdding &&
      sale.status === "CONFIRMED" &&
      autoEnabled &&
      !remittances[sale.id]?.trim()
    ) {
      generateRemittanceNumber(orgSlug).then((result) => {
        const number = result.number;
        if (result.success && number) {
          setRemittances((current) => ({ ...current, [sale.id]: number }));
        }
      });
    }
  };

  const updateRemittance = (saleId: string, value: string) => {
    setRemittances((prev) => ({ ...prev, [saleId]: value }));
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    const selected = availableSales.filter((sale) => selectedIds.has(sale.id));

    if (selected.length === 0) {
      setErrorMessage("Seleccioná al menos una venta");
      return;
    }

    const missing = selected.filter(
      (sale) => sale.status === "CONFIRMED" && !remittances[sale.id]?.trim()
    );
    if (missing.length > 0) {
      setErrorMessage(
        "Completá el número de remito de las ventas seleccionadas"
      );
      return;
    }

    const remitMap: Record<string, string> = {};
    for (const sale of selected) {
      if (sale.status === "CONFIRMED") {
        remitMap[sale.id] = remittances[sale.id].trim();
      }
    }

    setIsPending(true);
    try {
      await addSales.mutateAsync({
        routeSheetId: routeSheet.id,
        saleIds: selected.map((sale) => sale.id),
        remittances: remitMap,
      });
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al agregar las ventas a la hoja de ruta"
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Agregar ventas a la hoja de ruta</DialogTitle>
          <DialogDescription>
            Seleccioná las ventas confirmadas o despachadas que viajan con{" "}
            {routeSheet.carrier?.name ?? "el transporte"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {availableSales.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay ventas disponibles para agregar.
            </p>
          ) : (
            <div className="max-h-[46dvh] space-y-2 overflow-y-auto pr-1 sm:max-h-72">
              {availableSales.map((sale) => (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
                  key={sale.id}
                >
                  <Checkbox
                    checked={selectedIds.has(sale.id)}
                    onCheckedChange={() => toggleSale(sale)}
                  />
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        #{sale.sale_number ?? "—"}
                      </span>
                      {sale.status === "CONFIRMED" ? (
                        <Badge variant="secondary">Confirmada</Badge>
                      ) : (
                        <Badge variant="outline">Despachada</Badge>
                      )}
                    </div>
                    <p className="truncate text-muted-foreground text-sm">
                      {sale.customer_name}
                    </p>
                  </div>

                  <span className="shrink-0 font-medium text-sm tabular-nums">
                    {formatCurrency(sale.total_amount)}
                  </span>

                  {sale.status === "CONFIRMED" ? (
                    <div className="w-full shrink-0 sm:w-36">
                      <Input
                        onChange={(ev) =>
                          updateRemittance(sale.id, ev.target.value)
                        }
                        placeholder="N° de remito"
                        value={remittances[sale.id] ?? ""}
                      />
                    </div>
                  ) : (
                    <Badge className="shrink-0" variant="outline">
                      {sale.remittance_number ?? "Sin remito"}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isPending || availableSales.length === 0}
            onClick={handleSubmit}
          >
            {isPending ? "Agregando..." : "Agregar ventas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RouteSheetCarrierGroup({
  orgSlug,
  routeSheet,
}: RouteSheetCarrierGroupProps) {
  const { updateStatus, removeSale, deleteRouteSheet } =
    useRouteSheetMutations(orgSlug);
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const isCompleted = routeSheet.status === "COMPLETED";

  const handleUpdateStatus = async (status: RouteSheetWithSales["status"]) => {
    try {
      await updateStatus.mutateAsync({
        routeSheetId: routeSheet.id,
        status,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la hoja de ruta"
      );
    }
  };

  const handleRemoveSale = async (saleId: string) => {
    try {
      await removeSale.mutateAsync({
        routeSheetId: routeSheet.id,
        saleId,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo quitar la venta de la hoja de ruta"
      );
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRouteSheet.mutateAsync({ routeSheetId: routeSheet.id });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la hoja de ruta"
      );
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <RouteSheetHeader
          expanded={expanded}
          isDeleting={deleteRouteSheet.isPending}
          isUpdatingStatus={updateStatus.isPending}
          onDelete={handleDelete}
          onToggleExpand={() => setExpanded((prev) => !prev)}
          onUpdateStatus={handleUpdateStatus}
          routeSheet={routeSheet}
        />

        {expanded && (
          <div className="mt-4 space-y-2 border-t pt-4">
            {routeSheet.sales.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Esta hoja de ruta no tiene ventas asignadas.
              </p>
            ) : (
              routeSheet.sales.map((sale) => (
                <RouteSheetSaleRow
                  isRemoving={removeSale.isPending}
                  key={sale.id}
                  onRemove={() => handleRemoveSale(sale.id)}
                  sale={sale}
                />
              ))
            )}

            {!isCompleted && (
              <Button
                onClick={() => setAddOpen(true)}
                size="sm"
                variant="outline"
              >
                <PlusIcon className="mr-1 h-4 w-4" weight="bold" />
                Agregar ventas
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <AddSalesDialog
        onOpenChange={setAddOpen}
        open={addOpen}
        orgSlug={orgSlug}
        routeSheet={routeSheet}
      />
    </Card>
  );
}
