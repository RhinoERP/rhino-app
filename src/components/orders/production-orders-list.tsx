"use client";

import {
  ArrowRight,
  CheckCircle,
  FileText,
  Scissors,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import { ordersQueryKey } from "@/modules/orders/queries/query-keys";
import type { OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type ProductionOrdersListProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
};

export function ProductionOrdersList({
  orders,
  orgSlug,
}: ProductionOrdersListProps) {
  const queryClient = useQueryClient();

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Scissors className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">
          Sin pedidos en producción
        </p>
        <p className="mt-1 text-muted-foreground/60 text-sm">
          Los pedidos aparecen acá cuando el área de Compras los aprueba.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <ProductionOrderCard
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

function ProductionOrderCard({
  order,
  orgSlug,
  onActionComplete,
}: {
  order: OrderWithDetails;
  orgSlug: string;
  onActionComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const customer = order.quotes?.customers;
  const quote = order.quotes;

  const handleApproveDesign = () => {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "PREPARING",
        notes: "Diseño aprobado — pasa a preparación del pedido",
        extraFields: { design_approved_at: new Date().toISOString() },
      });

      if (result.success) {
        toast.success(
          `Pedido ${order.order_number}: diseño aprobado, pasa a preparación`
        );
        onActionComplete();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  };

  const handleStartDesign = () => {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "DESIGN_REVIEW",
        notes: "Boceto generado — pendiente revisión",
        extraFields: { production_started_at: new Date().toISOString() },
      });

      if (result.success) {
        onActionComplete();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold">
              {order.order_number}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/org/${orgSlug}/produccion/${order.id}/boceto`}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {order.status === "IN_PRODUCTION"
                  ? "Crear boceto"
                  : "Ver boceto"}
              </Link>
            </Button>
            {order.status === "IN_PRODUCTION" && (
              <Button
                disabled={isPending}
                onClick={handleStartDesign}
                size="sm"
                variant="secondary"
              >
                Marcar boceto listo
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
            {order.status === "DESIGN_REVIEW" && (
              <Button
                disabled={isPending}
                onClick={handleApproveDesign}
                size="sm"
              >
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                Aprobar y enviar a Despacho
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="border-t pt-3">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            {customer?.fantasy_name || customer?.business_name || "—"}
          </span>
          {quote && (
            <span className="font-medium">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            {quote?.quote_items?.length ?? 0} producto(s)
          </span>
          <span className="text-muted-foreground text-xs">
            {formatDate(order.created_at ?? "")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
