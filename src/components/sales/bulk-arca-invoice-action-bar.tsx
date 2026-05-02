"use client";

import { ReceiptIcon } from "@phosphor-icons/react";
import type { Table } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DataTableActionBar,
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
import { useEmitBulkSaleInvoicesMutation } from "@/modules/arca/hooks/use-emit-bulk-sale-invoices-mutation";
import type {
  ArcaBulkSaleInvoiceItemResult,
  ArcaBulkSaleInvoiceResult,
} from "@/modules/arca/types";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type SalesBulkArcaInvoiceActionBarProps = {
  orgSlug: string;
  table: Table<SalesOrderWithCustomer>;
};

function getSaleLabel(item: {
  saleNumber?: string | null;
  customerName?: string | null;
}) {
  const saleNumber = item.saleNumber?.trim() || "Sin N°";
  const customerName = item.customerName?.trim() || "Cliente sin nombre";

  return `${saleNumber} · ${customerName}`;
}

function renderResultLine(item: ArcaBulkSaleInvoiceItemResult) {
  const base = getSaleLabel(item);

  if (item.invoiceNumber) {
    return `${base} · ${item.invoiceNumber}`;
  }

  return base;
}

function notifyBulkInvoiceResult(result: ArcaBulkSaleInvoiceResult) {
  if (result.authorizedCount > 0 && result.errorCount === 0) {
    toast.success(
      `Se emitieron ${result.authorizedCount} factura${result.authorizedCount === 1 ? "" : "s"} en ARCA.`
    );
    return;
  }

  if (result.authorizedCount > 0 || result.alreadyAuthorizedCount > 0) {
    toast.warning(
      `Proceso finalizado: ${result.authorizedCount} emitida${result.authorizedCount === 1 ? "" : "s"}, ${result.alreadyAuthorizedCount} ya emitida${result.alreadyAuthorizedCount === 1 ? "" : "s"} y ${result.errorCount} con observaciones.`
    );
    return;
  }

  toast.error("No se pudo emitir ninguna de las ventas seleccionadas.");
}

export function SalesBulkArcaInvoiceActionBar({
  orgSlug,
  table,
}: SalesBulkArcaInvoiceActionBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<ArcaBulkSaleInvoiceResult | null>(
    null
  );
  const { emitBulkSaleInvoices } = useEmitBulkSaleInvoicesMutation();

  const selectedSales = useMemo(
    () =>
      table.getFilteredSelectedRowModel().rows.map((row) => {
        const sale = row.original;
        return {
          saleId: sale.id,
          saleNumber:
            sale.sale_number !== null && sale.sale_number !== undefined
              ? String(sale.sale_number)
              : sale.invoice_number,
          customerName:
            sale.customer?.fantasy_name ||
            sale.customer?.business_name ||
            "Cliente desconocido",
        };
      }),
    [table]
  );

  const authorizedResults =
    summary?.results.filter((item) => item.status === "authorized") ?? [];
  const alreadyAuthorizedResults =
    summary?.results.filter((item) => item.status === "already_authorized") ??
    [];
  const errorResults =
    summary?.results.filter((item) => item.status === "error") ?? [];

  const handleConfirm = async () => {
    try {
      const result = await emitBulkSaleInvoices.mutateAsync({
        orgSlug,
        sales: selectedSales,
      });

      setConfirmOpen(false);
      setSummary(result);
      table.toggleAllRowsSelected(false);
      notifyBulkInvoiceResult(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron emitir las facturas en ARCA."
      );
    }
  };

  return (
    <>
      <DataTableActionBar table={table}>
        <DataTableActionBarSelection table={table} />
        <DataTableActionBarAction
          isPending={emitBulkSaleInvoices.isPending}
          onClick={() => setConfirmOpen(true)}
          tooltip="Emitir facturas ARCA"
        >
          <ReceiptIcon className="size-3.5" weight="duotone" />
          Emitir ARCA
        </DataTableActionBarAction>
      </DataTableActionBar>

      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir facturas ARCA</DialogTitle>
            <DialogDescription>
              Se van a procesar {selectedSales.length} venta
              {selectedSales.length === 1 ? "" : "s"}. Las que no cumplan los
              requisitos fiscales o de configuración quedarán informadas con su
              motivo.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
            {selectedSales.map((sale) => (
              <div className="text-sm" key={sale.saleId}>
                {getSaleLabel(sale)}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setConfirmOpen(false)} variant="outline">
              Cancelar
            </Button>
            <Button
              disabled={emitBulkSaleInvoices.isPending}
              onClick={handleConfirm}
            >
              {emitBulkSaleInvoices.isPending
                ? "Emitiendo..."
                : "Confirmar emisión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSummary(null);
          }
        }}
        open={summary !== null}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resultado de facturación masiva</DialogTitle>
            <DialogDescription>
              {summary
                ? `${summary.authorizedCount} emitida${summary.authorizedCount === 1 ? "" : "s"}, ${summary.alreadyAuthorizedCount} ya emitida${summary.alreadyAuthorizedCount === 1 ? "" : "s"} y ${summary.errorCount} con observaciones.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {authorizedResults.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Emitidas</h3>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {authorizedResults.map((item) => (
                    <div className="text-sm" key={`${item.saleId}-ok`}>
                      {renderResultLine(item)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {alreadyAuthorizedResults.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Ya emitidas</h3>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {alreadyAuthorizedResults.map((item) => (
                    <div className="text-sm" key={`${item.saleId}-already`}>
                      {renderResultLine(item)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {errorResults.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">No emitidas</h3>
                <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border p-3">
                  {errorResults.map((item) => (
                    <div
                      className="space-y-1 text-sm"
                      key={`${item.saleId}-error`}
                    >
                      <div className="font-medium">
                        {renderResultLine(item)}
                      </div>
                      <div className="text-muted-foreground">
                        {item.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={() => setSummary(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
