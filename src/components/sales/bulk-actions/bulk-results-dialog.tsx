"use client";

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BulkSaleResult } from "@/modules/sales/actions/bulk-confirm-sales.action";

type BulkResultsDialogProps = {
  open: boolean;
  onClose: () => void;
  results: BulkSaleResult[];
  actionLabel: string;
};

export function BulkResultsDialog({
  open,
  onClose,
  results,
  actionLabel,
}: BulkResultsDialogProps) {
  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  return (
    <Dialog onOpenChange={(v) => !v && onClose()} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resultados — {actionLabel}</DialogTitle>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {results.map((r) => (
            <div
              className="flex items-start gap-2 text-sm"
              key={r.saleId || r.saleNumber}
            >
              {r.ok ? (
                <CheckCircleIcon
                  className="mt-0.5 size-4 shrink-0 text-green-500"
                  weight="fill"
                />
              ) : (
                <XCircleIcon
                  className="mt-0.5 size-4 shrink-0 text-red-500"
                  weight="fill"
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="font-medium">{r.saleNumber}</span>
                {!r.ok && (
                  <p className="wrap-break-word text-muted-foreground">
                    {r.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground text-sm">
          {successCount} exitosa{successCount !== 1 ? "s" : ""}, {failCount} con
          error{failCount !== 1 ? "es" : ""}.
        </p>

        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
