"use client";

import { XCircleIcon } from "@phosphor-icons/react";
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
import { cancelOrderAction } from "@/modules/orders/actions/cancel-order.action";
import type { OrderFlowStatus } from "@/modules/orders/types";
import { ORDER_STATUS_CONFIG } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type CancelOrderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderFlowStatus;
  type: "single" | "child" | "parent";
  childCount?: number;
  onSuccess?: () => void;
};

export function CancelOrderModal({
  open,
  onOpenChange,
  orgSlug,
  orderId,
  orderNumber,
  orderStatus,
  type,
  childCount = 0,
  onSuccess,
}: CancelOrderModalProps) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const config =
    ORDER_STATUS_CONFIG[orderStatus as keyof typeof ORDER_STATUS_CONFIG];

  const dialogTitle = (() => {
    if (type === "child") {
      return "Cancelar sub-pedido";
    }
    if (type === "parent") {
      return "Cancelar pedido completo";
    }
    return "Cancelar pedido";
  })();

  const description = (() => {
    if (type === "child") {
      return (
        <>
          Se va a cancelar el sub-pedido{" "}
          <span className="font-medium font-mono">{orderNumber}</span> en estado{" "}
          <OrderStatusBadge status={orderStatus} />
          {". "}
          <span className="text-muted-foreground text-sm">
            Los items quedarán asignados a este pedido para trazabilidad, pero
            se eliminarán de la nota de venta.
          </span>
        </>
      );
    }
    if (type === "parent") {
      return (
        <>
          Se va a cancelar el pedido{" "}
          <span className="font-medium font-mono">{orderNumber}</span> y{" "}
          <span className="font-medium">{childCount} sub-pedido(s)</span> en
          estado <OrderStatusBadge status={orderStatus} />
          {". "}
          <span className="text-muted-foreground text-sm">
            Esta acción cancelará todos los sub-pedidos activos.
          </span>
        </>
      );
    }
    return (
      <>
        ¿Estás seguro de que quieres cancelar el pedido{" "}
        <span className="font-medium font-mono">{orderNumber}</span> en estado{" "}
        <OrderStatusBadge status={orderStatus} />?
      </>
    );
  })();

  function handleConfirm() {
    if (!notes.trim()) {
      return;
    }

    startTransition(async () => {
      const result = await cancelOrderAction(orgSlug, orderId, notes);

      if (result.success) {
        const label = config?.label ?? orderStatus;
        toast.success(`Pedido ${orderNumber} cancelado (estado: ${label})`);
        setNotes("");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Error al cancelar pedido");
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
            htmlFor="cancel-notes"
          >
            Motivo de cancelación <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="cancel-notes"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describí el motivo de la cancelación..."
            value={notes}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Volver
          </Button>
          <Button
            disabled={!notes.trim() || isPending}
            onClick={handleConfirm}
            variant="destructive"
          >
            <XCircleIcon className="size-4" />
            {isPending ? "Cancelando..." : "Confirmar cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
