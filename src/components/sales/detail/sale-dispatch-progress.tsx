"use client";

import { CheckCircle, FileText, Package, Truck } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { useSaleDispatchProgress } from "@/modules/sales/hooks/use-sale-dispatch-progress";

type SaleDispatchProgressProps = {
  orgSlug: string;
  saleId: string;
};

export function SaleDispatchProgress({
  orgSlug,
  saleId,
}: SaleDispatchProgressProps) {
  const { data, isLoading } = useSaleDispatchProgress(orgSlug, saleId, true);

  if (isLoading || !data) {
    return null;
  }

  const {
    total_children,
    dispatched_children,
    delivered_children,
    completed,
    events,
  } = data;
  const percentage =
    total_children > 0
      ? Math.round((delivered_children / total_children) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {completed ? (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          ) : (
            <Truck className="h-5 w-5" />
          )}
          {completed ? "Despacho completado" : "Progreso de despacho"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {completed
              ? `${total_children} sub-pedidos entregados`
              : `${delivered_children} de ${total_children} sub-pedidos entregados`}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                completed ? "bg-emerald-500" : "bg-primary"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {dispatched_children > 0 && (
          <p className="text-muted-foreground text-xs">
            {dispatched_children} sub-pedido
            {dispatched_children !== 1 ? "s" : ""} en tránsito
          </p>
        )}

        {events.length > 0 ? (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                className="rounded-lg border p-3"
                key={event.remito_number + event.child_order_id}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      Remito #{event.remito_number}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(event.dispatched_at)}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Sub-pedido: {event.child_order_number}
                </p>
                {event.items.length > 0 && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {event.items.map((item) => (
                      <div
                        className="flex items-center gap-2 text-xs"
                        key={item.id}
                      >
                        <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span>{item.description}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums">
                          ×{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-muted-foreground text-sm">
            Sin envíos registrados
          </p>
        )}
      </CardContent>
    </Card>
  );
}
