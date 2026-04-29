"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { bulkCancelSalesAction } from "@/modules/sales/actions/bulk-cancel-sales.action";
import type { BulkSaleResult } from "@/modules/sales/actions/bulk-confirm-sales.action";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { BulkResultsDialog } from "./bulk-results-dialog";

type BulkCancelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  selectedSales: SalesOrderWithCustomer[];
  onSuccess: () => void;
};

export function BulkCancelDialog({
  open,
  onOpenChange,
  orgSlug,
  selectedSales,
  onSuccess,
}: BulkCancelDialogProps) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [results, setResults] = useState<BulkSaleResult[] | null>(null);

  const saleLabel = (s: SalesOrderWithCustomer) =>
    s.sale_number ? `#${s.sale_number}` : s.id;

  const handleConfirm = async () => {
    setIsPending(true);
    const result = await bulkCancelSalesAction(
      orgSlug,
      selectedSales.map((s) => ({
        saleId: s.id,
        saleNumber: saleLabel(s),
      }))
    );
    setIsPending(false);
    onOpenChange(false);

    if (result.error && result.results.length === 0) {
      toast.error(result.error);
      return;
    }

    setResults(result.results);
    const successCount = result.results.filter((r) => r.ok).length;
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: salesQueryKey(orgSlug) });
      onSuccess();
    }
  };

  return (
    <>
      <AlertDialog
        onOpenChange={(v) => {
          if (!isPending) {
            onOpenChange(v);
          }
        }}
        open={open}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Cancelar {selectedSales.length} venta
              {selectedSales.length !== 1 ? "s" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Esta acción es irreversible. Se cancelará
                  {selectedSales.length !== 1 ? "n" : ""} las siguientes ventas
                  y se revertirán los movimientos de stock asociados:
                </p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
                  {selectedSales.map((s) => (
                    <li className="font-medium" key={s.id}>
                      {saleLabel(s)} —{" "}
                      {s.customer?.business_name ?? "Sin cliente"}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <Button
              disabled={isPending}
              onClick={handleConfirm}
              variant="destructive"
            >
              {isPending ? "Cancelando..." : "Cancelar ventas"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {results && (
        <BulkResultsDialog
          actionLabel="Cancelar"
          onClose={() => setResults(null)}
          open={true}
          results={results}
        />
      )}
    </>
  );
}
