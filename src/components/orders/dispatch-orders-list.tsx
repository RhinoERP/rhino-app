"use client";

import { CheckCircle, ChevronDown, ChevronUp, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrderFlowStatus, OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type DispatchOrdersListProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
};

export function DispatchOrdersList({
  orders,
  orgSlug,
}: DispatchOrdersListProps) {
  const router = useRouter();

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Truck className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">
          Sin pedidos en despacho
        </p>
        <p className="mt-1 text-muted-foreground/60 text-sm">
          Los pedidos aparecen acá cuando Producción los aprueba.
        </p>
      </div>
    );
  }

  // Agrupar por estado
  const groups: {
    label: string;
    statuses: OrderFlowStatus[];
    items: OrderWithDetails[];
  }[] = [
    {
      label: "Preparando",
      statuses: ["PREPARING"],
      items: orders.filter((o) => o.status === "PREPARING"),
    },
    {
      label: "Despachados",
      statuses: ["DISPATCHED"],
      items: orders.filter((o) => o.status === "DISPATCHED"),
    },
    {
      label: "Entregados",
      statuses: ["DELIVERED"],
      items: orders.filter((o) => o.status === "DELIVERED"),
    },
  ];

  return (
    <div className="space-y-8">
      {groups.map((group) =>
        group.items.length > 0 ? (
          <div key={group.label}>
            <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              {group.label} ({group.items.length})
            </h2>
            <div className="space-y-3">
              {group.items.map((order) => (
                <DispatchOrderCard
                  key={order.id}
                  onActionComplete={() => router.refresh()}
                  order={order}
                  orgSlug={orgSlug}
                />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

function DispatchOrderCard({
  order,
  orgSlug,
  onActionComplete,
}: {
  order: OrderWithDetails;
  orgSlug: string;
  onActionComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState(
    order.tracking_number ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const customer = order.quotes?.customers;
  const quote = order.quotes;

  const handleAction = (newStatus: OrderFlowStatus, description: string) => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Dispatch action handles multiple status transitions with different payloads
    startTransition(async () => {
      const extra: Record<string, unknown> = {};

      if (newStatus === "DISPATCHED") {
        extra.dispatched_at = new Date().toISOString();
        if (trackingNumber) {
          extra.tracking_number = trackingNumber;
        }
        extra.dispatch_notes = notes;
      }
      if (newStatus === "DELIVERED") {
        extra.delivered_at = new Date().toISOString();
      }

      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus,
        notes: notes || description,
        extraFields: extra,
      });

      if (result.success) {
        toast.success(`Pedido ${order.order_number}: ${description}`);
        onActionComplete();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  };

  const isPreparing = order.status === "PREPARING";
  const isDispatched = order.status === "DISPATCHED";
  const isDelivered = order.status === "DELIVERED";

  return (
    <Card className={isDelivered ? "opacity-70" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold">
              {order.order_number}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          {!isDelivered && (
            <Button
              onClick={() => setExpanded(!expanded)}
              size="sm"
              variant="ghost"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            {customer?.fantasy_name || customer?.business_name || "—"}
          </span>
          {quote && (
            <span className="font-medium">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          {order.tracking_number && (
            <span className="font-mono text-muted-foreground text-xs">
              Tracking: {order.tracking_number}
            </span>
          )}
          {isDelivered && order.delivered_at && (
            <span className="text-emerald-600 text-xs">
              Entregado el {formatDate(order.delivered_at)}
            </span>
          )}
        </div>
      </CardHeader>

      {expanded && !isDelivered && (
        <CardContent className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del despacho..."
              rows={2}
              value={notes}
            />
          </div>

          {isPreparing && (
            <div className="flex flex-col gap-3">
              <div className="space-y-1.5">
                <Label>Número de seguimiento (opcional)</Label>
                <Input
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Nro. de tracking del transporte..."
                  value={trackingNumber}
                />
              </div>
              <Button
                disabled={isPending}
                onClick={() => handleAction("DISPATCHED", "Pedido despachado")}
              >
                <Truck className="mr-2 h-4 w-4" />
                Confirmar despacho
              </Button>
            </div>
          )}

          {isDispatched && (
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() => handleAction("DELIVERED", "Entrega confirmada")}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Confirmar entrega al cliente
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
