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
import type { BulkSaleResult } from "@/modules/sales/actions/bulk-confirm-sales.action";
import { bulkConfirmSalesAction } from "@/modules/sales/actions/bulk-confirm-sales.action";
import { salesQueryKey } from "@/modules/sales/queries/query-keys";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { BulkResultsDialog } from "./bulk-results-dialog";

type BulkConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  selectedSales: SalesOrderWithCustomer[];
  onSuccess: () => void;
};

export function BulkConfirmDialog({
  open,
  onOpenChange,
  orgSlug,
  selectedSales,
  onSuccess,
}: BulkConfirmDialogProps) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [results, setResults] = useState<BulkSaleResult[] | null>(null);

  const saleLabel = (s: SalesOrderWithCustomer) =>
    s.sale_number ? `#${s.sale_number}` : s.id;

  const handleConfirm = async () => {
    setIsPending(true);
    const result = await bulkConfirmSalesAction(
      orgSlug,
      selectedSales.map((s) => s.id)
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
            <AlertDialogTitle>
              Confirmar {selectedSales.length} venta
              {selectedSales.length !== 1 ? "s" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Se confirmará{selectedSales.length !== 1 ? "n" : ""} las
                  siguientes ventas:
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
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <Button disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Confirmando..." : "Confirmar ventas"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {results && (
        <BulkResultsDialog
          actionLabel="Confirmar"
          onClose={() => setResults(null)}
          open={true}
          results={results}
        />
      )}
    </>
  );
}
