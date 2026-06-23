"use client";

import { FileText, Package, Truck } from "@phosphor-icons/react";
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

  const { total_children, dispatched_children, events } = data;
  const percentage =
    total_children > 0
      ? Math.round((dispatched_children / total_children) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-5 w-5" />
          Progreso de despacho
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {dispatched_children} de {total_children} sub-pedidos despachados
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

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
