"use client";

import {
  CaretDown,
  CaretUp,
  CheckCircle,
  CurrencyDollar,
  XCircle,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import { ordersQueryKey } from "@/modules/orders/queries/query-keys";
import type { OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type FinanceOrdersReviewProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
};

export function FinanceOrdersReview({
  orders,
  orgSlug,
}: FinanceOrdersReviewProps) {
  const queryClient = useQueryClient();

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <CheckCircle className="mb-3 h-10 w-10 text-emerald-500/50" />
        <p className="font-medium text-muted-foreground">Todo al día</p>
        <p className="mt-1 text-muted-foreground/60 text-sm">
          No hay pedidos pendientes de revisión financiera.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderReviewCard
          key={order.id}
          onActionComplete={() =>
            queryClient.invalidateQueries({
              queryKey: ordersQueryKey(orgSlug),
            })
          }
          order={order}
          orgSlug={orgSlug}
        />
      ))}
    </div>
  );
}

function OrderReviewCard({
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
  const [isPending, startTransition] = useTransition();
  const customer = order.quotes?.customers;
  const quote = order.quotes;

  const handleAction = (approve: boolean) => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Finance action handles approval and rejection with conditional field mapping
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: approve ? "PENDING_STOCK" : "FINANCE_REJECTED",
        notes:
          notes ||
          (approve ? "Aprobado por Finanzas" : "Rechazado por Finanzas"),
        extraFields: approve
          ? { finance_reviewed_at: new Date().toISOString() }
          : {
              finance_reviewed_at: new Date().toISOString(),
              finance_notes: notes,
            },
      });

      if (result.success) {
        toast.success(
          approve
            ? `Pedido ${order.order_number} aprobado — pasa a verificación de stock`
            : `Pedido ${order.order_number} rechazado`
        );
        onActionComplete();
      } else {
        toast.error(result.error ?? "Error al procesar el pedido");
      }
    });
  };

  return (
    <Card
      className={
        order.status === "FINANCE_REJECTED" ? "border-rose-500/30" : ""
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold">
              {order.order_number}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <Button
            onClick={() => setExpanded(!expanded)}
            size="sm"
            variant="ghost"
          >
            {expanded ? (
              <CaretUp className="h-4 w-4" />
            ) : (
              <CaretDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Cliente: </span>
            <span className="font-medium">
              {customer?.fantasy_name || customer?.business_name || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <CurrencyDollar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">
              {quote ? formatCurrency(quote.total_amount, quote.currency) : "—"}
            </span>
          </div>
          <div className="text-muted-foreground">
            {formatDate(order.created_at ?? "")}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          {/* Productos del presupuesto */}
          {quote?.quote_items && quote.quote_items.length > 0 && (
            <div>
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Productos
              </p>
              <div className="space-y-1.5">
                {quote.quote_items.map((item) => (
                  <div
                    className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm"
                    key={item.id}
                  >
                    <span>{item.description || "Producto"}</span>
                    <div className="flex gap-3 text-muted-foreground">
                      <span>x{item.quantity}</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(item.subtotal, quote.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nota de revisión */}
          {order.status === "PENDING_FINANCE" && (
            <div className="space-y-2">
              <Label htmlFor={`notes-${order.id}`}>Notas (opcional)</Label>
              <Textarea
                id={`notes-${order.id}`}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agregá observaciones sobre la rentabilidad del pedido..."
                rows={2}
                value={notes}
              />
            </div>
          )}

          {/* Acciones */}
          {order.status === "PENDING_FINANCE" && (
            <div className="flex items-center gap-3">
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={() => handleAction(true)}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Aprobar pedido
              </Button>
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={() => handleAction(false)}
                variant="destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rechazar pedido
              </Button>
            </div>
          )}

          {order.status === "FINANCE_REJECTED" && (
            <div className="rounded-md bg-rose-500/10 px-3 py-2 text-rose-600 text-sm dark:text-rose-400">
              Pedido rechazado por Finanzas
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
