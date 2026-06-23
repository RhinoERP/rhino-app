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
  onSuccess,
}: RevertOrderModalProps) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!notes.trim()) {
      return;
    }

    startTransition(async () => {
      const result = await revertOrderStatusAction(orgSlug, orderId, notes);

      if (result.success) {
        toast.success(`Pedido ${orderNumber} vuelto a ${previousStatusLabel}`);
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
          <DialogTitle>Volver al estado anterior</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que quieres volver el pedido{" "}
            <span className="font-medium font-mono">{orderNumber}</span> a{" "}
            <OrderStatusBadge status={previousStatus} />?
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
            placeholder="Motivo de la reversión..."
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
            variant="destructive"
          >
            <ArrowFatLineLeftIcon className="size-4" />
            {isPending ? "Revirtiendo..." : `Volver a ${previousStatusLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
