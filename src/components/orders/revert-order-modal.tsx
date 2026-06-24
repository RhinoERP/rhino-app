"use client";

import { ArrowFatLineLeftIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
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
  revertType?: "normal" | "undo_creation";
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
  onSuccess,
}: RevertOrderModalProps) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const isUndoCreation = revertType === "undo_creation";

  const buttonLabel = (() => {
    if (isPending) {
      return "Procesando...";
    }
    if (isUndoCreation) {
      return "Cancelar sub-pedido y liberar items";
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
        const message = isUndoCreation
          ? `Sub-pedido ${orderNumber} cancelado y items liberados`
          : `Pedido ${orderNumber} vuelto a ${previousStatusLabel}`;
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
          <DialogTitle>
            {isUndoCreation
              ? "Deshacer sub-pedido"
              : "Volver al estado anterior"}
          </DialogTitle>
          <DialogDescription>
            {isUndoCreation ? (
              <>
                Se va a cancelar el sub-pedido{" "}
                <span className="font-medium font-mono">{orderNumber}</span> y
                sus items volverán al panel de stock para ser reasignados.
              </>
            ) : (
              <>
                ¿Estás seguro de que quieres volver el pedido{" "}
                <span className="font-medium font-mono">{orderNumber}</span> a{" "}
                <OrderStatusBadge status={previousStatus} />?
              </>
            )}
          </DialogDescription>
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
            placeholder={
              isUndoCreation
                ? "Motivo de la cancelación..."
                : "Motivo de la reversión..."
            }
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
            variant={isUndoCreation ? "destructive" : "default"}
          >
            <ArrowFatLineLeftIcon className="size-4" />
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
