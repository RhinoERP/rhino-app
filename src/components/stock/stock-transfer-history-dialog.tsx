"use client";

import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import {
  getTransferWarehousesAction,
  getWarehouseTransfersAction,
} from "@/modules/inventory/actions/stock-transfer.actions";

type StockTransferHistoryDialogProps = {
  orgSlug: string;
};

export function StockTransferHistoryDialog({
  orgSlug,
}: StockTransferHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const { data: warehouses = [], isPending: warehousesPending } = useQuery({
    queryKey: ["inventory-warehouses", orgSlug, "transfer"],
    queryFn: () => getTransferWarehousesAction(orgSlug),
    enabled: open,
    staleTime: 0,
  });
  const warehousesById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses]
  );

  useEffect(() => {
    if (open && !warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses[0].id);
    }
  }, [open, warehouseId, warehouses]);

  const { data: transfers = [], isPending: transfersPending } = useQuery({
    queryKey: ["stock-transfers", orgSlug, warehouseId],
    queryFn: () => getWarehouseTransfersAction(orgSlug, warehouseId),
    enabled: open && Boolean(warehouseId),
    staleTime: 0,
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowsLeftRightIcon className="size-4" />
          Transferencias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Transferencias entre depósitos</DialogTitle>
          <DialogDescription>
            Historial reciente de movimientos de entrada y salida por depósito.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Depósito</Label>
          <Select
            disabled={warehousesPending || warehouses.length === 0}
            onValueChange={setWarehouseId}
            value={warehouseId}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Seleccioná un depósito" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                  {warehouse.isDefault ? " · Principal" : ""}
                  {warehouse.isActive ? "" : " · Inactivo"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Lotes</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfersPending && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    Cargando transferencias...
                  </TableCell>
                </TableRow>
              )}
              {!transfersPending && transfers.length === 0 && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No hay transferencias registradas para este depósito.
                  </TableCell>
                </TableRow>
              )}
              {!transfersPending &&
                transfers.map((transfer) => {
                  const items = transfer.items ?? [];
                  const quantity = items.reduce(
                    (total, item) => total + Number(item.quantity),
                    0
                  );
                  return (
                    <TableRow key={transfer.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(transfer.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {warehousesById.get(transfer.source_warehouse_id)
                            ?.name ?? "Depósito"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {warehousesById.get(transfer.destination_warehouse_id)
                            ?.name ?? "Depósito"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {items.length}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quantity.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground text-sm">
                        {transfer.reason || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
