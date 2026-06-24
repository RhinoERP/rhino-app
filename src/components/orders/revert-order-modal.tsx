"use client";

import { ArrowFatLineLeftIcon } from "@phosphor-icons/react";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { RevertType } from "@/modules/orders/actions/check-order-revert.action";
import { revertOrderStatusAction } from "@/modules/orders/actions/revert-order-status.action";
import type { OrderFlowStatus } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type RevertOrderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orderId: string;
  orderNumber: string;
  previousStatus: OrderFlowStatus;
  previousStatusLabel: string;
  revertType?: RevertType;
  childCount?: number;
  onSuccess?: () => void;
};

export function RevertOrderModal({
  open,
  onOpenChange,
  orgSlug,
  orderId,
  orderNumber,
  previousStatus,
  previousStatusLabel,
  revertType = "normal",
  childCount = 0,
  onSuccess,
}: RevertOrderModalProps) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const isUndoCreation = revertType === "undo_creation";
  const isCascadeRevert = revertType === "cascade_revert";

  let dialogTitle: string;
  if (isUndoCreation) {
    dialogTitle = "Deshacer sub-pedido";
  } else if (isCascadeRevert) {
    dialogTitle = "Revertir pedido completo";
  } else {
    dialogTitle = "Volver al estado anterior";
  }

  let description: ReactNode;
  if (isUndoCreation) {
    description = (
      <>
        Se va a cancelar el sub-pedido{" "}
        <span className="font-medium font-mono">{orderNumber}</span> y sus items
        volverán al panel de stock para ser reasignados.
      </>
    );
  } else if (isCascadeRevert) {
    description = (
      <>
        Se va a cancelar{" "}
        <span className="font-medium">{childCount} sub-pedido(s)</span> y el
        pedido <span className="font-medium font-mono">{orderNumber}</span>{" "}
        volverá a aprobación de finanzas.
      </>
    );
  } else {
    description = (
      <>
        ¿Estás seguro de que quieres volver el pedido{" "}
        <span className="font-medium font-mono">{orderNumber}</span> a{" "}
        <OrderStatusBadge status={previousStatus} />?
      </>
    );
  }

  const placeholder = isUndoCreation
    ? "Motivo de la cancelación..."
    : "Motivo de la reversión...";

  const buttonLabel = (() => {
    if (isPending) {
      return "Procesando...";
    }
    if (isUndoCreation) {
      return "Cancelar sub-pedido y liberar items";
    }
    if (isCascadeRevert) {
      return "Revertir y cancelar sub-pedidos";
    }
    return `Volver a ${previousStatusLabel}`;
  })();

  function handleConfirm() {
    if (!notes.trim()) {
      return;
    }

    startTransition(async () => {
      const result = await revertOrderStatusAction(
        orgSlug,
        orderId,
        notes,
        revertType
      );

      if (result.success) {
        let message: string;
        if (isUndoCreation) {
          message = `Sub-pedido ${orderNumber} cancelado y items liberados`;
        } else if (isCascadeRevert) {
          message = `Pedido ${orderNumber} revertido y ${childCount} sub-pedido(s) cancelado(s)`;
        } else {
          message = `Pedido ${orderNumber} vuelto a ${previousStatusLabel}`;
        }
        toast.success(message);
        setNotes("");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Error al revertir");
      }
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div>
          <label
            className="mb-1.5 block font-medium text-sm"
            htmlFor="revert-notes"
          >
            Observación <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="revert-notes"
            onChange={(e) => setNotes(e.target.value)}
            placeholder={placeholder}
            value={notes}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={!notes.trim() || isPending}
            onClick={handleConfirm}
            variant={
              isUndoCreation || isCascadeRevert ? "destructive" : "default"
            }
          >
            <ArrowFatLineLeftIcon className="size-4" />
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
