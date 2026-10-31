"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function StockReentryFallbackDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            El depósito original está desactivado
          </AlertDialogTitle>
          <AlertDialogDescription>
            El stock no puede volver a ese depósito. Podés cancelar o confirmar
            su reingreso en el depósito principal, conservando producto,
            variante y lote comercial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button disabled={props.pending} onClick={props.onConfirm}>
            Enviar al depósito principal
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
