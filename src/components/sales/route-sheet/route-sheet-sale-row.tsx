"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { RouteSheetSale } from "@/modules/route-sheets/types";

type RouteSheetSaleRowProps = {
  canManage: boolean;
  sale: RouteSheetSale;
  isRemoving: boolean;
  onRemove: () => void;
};

export function RouteSheetSaleRow({
  canManage,
  sale,
  isRemoving,
  onRemove,
}: RouteSheetSaleRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-16 shrink-0 font-medium text-sm">
          #{sale.sale_number ?? "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {sale.customer_name}
        </span>
        <Badge className="shrink-0" variant="outline">
          {sale.remittance_number ?? "Sin remito"}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="font-medium text-sm tabular-nums">
          {formatCurrency(sale.total_amount)}
        </span>
        {canManage && (
          <Button
            aria-label="Quitar venta de la hoja de ruta"
            disabled={isRemoving}
            onClick={() => setConfirmOpen(true)}
            size="icon"
            variant="ghost"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {canManage && (
        <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Quitar esta venta?</AlertDialogTitle>
              <AlertDialogDescription>
                La venta saldrá de la hoja de ruta pero permanecerá despachada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRemoving}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isRemoving}
                onClick={onRemove}
              >
                {isRemoving ? "Quitando..." : "Quitar venta"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
