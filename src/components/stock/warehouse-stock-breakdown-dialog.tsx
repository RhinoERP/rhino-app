"use client";

import { DownloadSimpleIcon, WarehouseIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadXlsx } from "@/lib/download-utils";
import { getWarehouseStockBreakdownAction } from "@/modules/inventory/actions/get-warehouse-stock-breakdown.action";
import type { WarehouseStockBreakdown } from "@/modules/inventory/service/warehouse-stock-report.service";

type WarehouseStockBreakdownDialogProps = {
  orgSlug: string;
};

function formatQuantity(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function getBadgeLabel(row: WarehouseStockBreakdown): string {
  if (!row.isActive) {
    return "Inactivo";
  }
  return row.isDefault ? "Principal" : "Activo";
}

export function WarehouseStockBreakdownDialog({
  orgSlug,
}: WarehouseStockBreakdownDialogProps) {
  const [open, setOpen] = useState(false);
  const {
    data = [],
    isPending,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["warehouse-stock-breakdown", orgSlug],
    queryFn: () => getWarehouseStockBreakdownAction(orgSlug),
    enabled: open,
    staleTime: 0,
  });
  const hasData = isSuccess && data.length > 0;
  const isEmpty = isSuccess && data.length === 0;

  const totals = data.reduce(
    (accumulator, row) => ({
      products: accumulator.products + row.productCount,
      lots: accumulator.lots + row.lotCount,
      units: accumulator.units + row.totalUnits,
      kg: accumulator.kg + row.totalKg,
      lt: accumulator.lt + row.totalLt,
    }),
    { products: 0, lots: 0, units: 0, kg: 0, lt: 0 }
  );

  const handleExport = async () => {
    try {
      await downloadXlsx({
        filename: "stock-por-deposito",
        sheetName: "Stock por depósito",
        format: "xlsx",
        headers: [
          "Depósito",
          "Estado",
          "Productos",
          "Lotes",
          "Unidades",
          "Kg",
          "Lt",
        ],
        rows: data.map((row) => [
          row.warehouseName,
          getBadgeLabel(row),
          formatQuantity(row.productCount),
          formatQuantity(row.lotCount),
          formatQuantity(row.totalUnits),
          formatQuantity(row.totalKg),
          formatQuantity(row.totalLt),
        ]),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo exportar el stock por depósito"
      );
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <WarehouseIcon className="size-4" />
          Por depósito
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Stock por depósito</DialogTitle>
          <DialogDescription>
            Stock de los depósitos a los que tenés acceso. Las transferencias no
            duplican existencias; un producto puede figurar en varios depósitos.
          </DialogDescription>
        </DialogHeader>

        {isError && (
          <div className="space-y-2 text-sm" role="alert">
            <p className="text-destructive">
              No se pudo cargar el stock por depósito.
            </p>
            <Button
              disabled={isFetching}
              onClick={() => refetch()}
              size="sm"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        )}

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depósito</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead className="text-right">Lotes</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Kg</TableHead>
                <TableHead className="text-right">Lt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    Cargando stock...
                  </TableCell>
                </TableRow>
              )}
              {isEmpty && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No tenés depósitos habilitados.
                  </TableCell>
                </TableRow>
              )}
              {hasData &&
                data.map((row) => (
                  <TableRow key={row.warehouseId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{row.warehouseName}</span>
                        <Badge variant={row.isActive ? "secondary" : "outline"}>
                          {getBadgeLabel(row)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.productCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.lotCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.totalUnits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.totalKg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.totalLt)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
            {hasData && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">
                    Suma por depósito
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(totals.products)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(totals.lots)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(totals.units)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(totals.kg)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(totals.lt)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        <DialogFooter>
          <Button
            disabled={!hasData || isFetching}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <DownloadSimpleIcon className="size-4" />
            Exportar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
