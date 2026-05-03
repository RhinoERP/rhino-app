"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { bulkEmitSaleInvoicesAction } from "@/modules/arca/actions/bulk-emit-sale-invoices.action";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { BulkResultsDialog } from "./bulk-results-dialog";

type BulkInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  selectedSales: SalesOrderWithCustomer[];
  onSuccess: () => void;
};

type SaleWarning = {
  saleId: string;
  issues: string[];
};

const SUPPORTED_INVOICE_TYPES = new Set([
  "FACTURA_A",
  "FACTURA_B",
  "FACTURA_C",
]);
const SUPPORTED_SALE_STATUSES = new Set(["CONFIRMED", "DISPATCH", "DELIVERED"]);

function getSaleLabel(sale: SalesOrderWithCustomer) {
  return sale.sale_number ? `#${sale.sale_number}` : sale.id;
}

function getSaleWarnings(sale: SalesOrderWithCustomer): string[] {
  const issues: string[] = [];

  if (!SUPPORTED_SALE_STATUSES.has(sale.status)) {
    issues.push("la venta debe estar confirmada, despachada o entregada");
  }

  if (!SUPPORTED_INVOICE_TYPES.has(sale.invoice_type)) {
    issues.push("el tipo de comprobante debe ser Factura A, B o C");
  }

  if (!sale.customer?.cuit?.trim()) {
    issues.push("el cliente no tiene CUIT");
  }

  if (!sale.customer?.tax_condition?.trim()) {
    issues.push("el cliente no tiene condición fiscal");
  }

  if (sale.arca_status === "pending") {
    issues.push("ya tiene una emisión ARCA en curso");
  }

  if (sale.invoice_number?.trim() && sale.arca_status !== "authorized") {
    issues.push("ya tiene un número de comprobante manual cargado");
  }

  return issues;
}

export function BulkInvoiceDialog({
  open,
  onOpenChange,
  orgSlug,
  selectedSales,
  onSuccess,
}: BulkInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof bulkEmitSaleInvoicesAction>>["results"] | null
  >(null);

  const warnings = useMemo<SaleWarning[]>(
    () =>
      selectedSales
        .map((sale) => ({
          saleId: sale.id,
          issues: getSaleWarnings(sale),
        }))
        .filter((sale) => sale.issues.length > 0),
    [selectedSales]
  );

  const handleConfirm = async () => {
    setIsPending(true);

    const result = await bulkEmitSaleInvoicesAction(
      orgSlug,
      selectedSales.map((sale) => ({
        saleId: sale.id,
        saleNumber: getSaleLabel(sale),
      }))
    );

    setIsPending(false);
    onOpenChange(false);

    if (result.error && result.results.length === 0) {
      toast.error(result.error);
      return;
    }

    setResults(result.results);

    const successCount = result.results.filter((entry) => entry.ok).length;
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      onSuccess();
    }
  };

  return (
    <>
      <AlertDialog
        onOpenChange={(value) => {
          if (!isPending) {
            onOpenChange(value);
          }
        }}
        open={open}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Emitir factura para {selectedSales.length} venta
              {selectedSales.length !== 1 ? "s" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Se intentará emitir la factura fiscal ARCA para cada venta. Si
                  alguna no cumple los requisitos, se informará el motivo sin
                  frenar el resto.
                </p>

                {warnings.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900 text-sm">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <WarningCircleIcon className="size-4" weight="fill" />
                      Ventas con observaciones previas
                    </div>
                    <ul className="max-h-36 space-y-1 overflow-y-auto">
                      {warnings.map((warning) => {
                        const sale = selectedSales.find(
                          (entry) => entry.id === warning.saleId
                        );

                        return (
                          <li key={warning.saleId}>
                            <span className="font-medium">
                              {sale ? getSaleLabel(sale) : warning.saleId}
                            </span>{" "}
                            · {warning.issues.join(", ")}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
                  {selectedSales.map((sale) => (
                    <li className="font-medium" key={sale.id}>
                      {getSaleLabel(sale)} —{" "}
                      {sale.customer?.business_name ?? "Sin cliente"}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <Button disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Emitiendo..." : "Emitir facturas"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {results ? (
        <BulkResultsDialog
          actionLabel="Facturar"
          onClose={() => setResults(null)}
          open={true}
          results={results}
        />
      ) : null}
    </>
  );
}
