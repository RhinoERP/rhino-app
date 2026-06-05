"use client";

import {
  CalendarIcon,
  CheckCircleIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type DispatchOrdersListProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
};

export function DispatchOrdersList({
  orders,
  orgSlug,
}: DispatchOrdersListProps) {
  const dispatchOrders = orders.filter((o) =>
    ["PREPARING", "DISPATCHED", "DELIVERED"].includes(o.status)
  );

  if (dispatchOrders.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin pedidos en despacho</EmptyTitle>
            <EmptyDescription>
              No hay pedidos en preparación, despachados o entregados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dispatchOrders.map((order) => (
        <DispatchOrderCard key={order.id} order={order} orgSlug={orgSlug} />
      ))}
    </div>
  );
}

type DispatchOrderCardProps = {
  order: OrderWithDetails;
  orgSlug: string;
};

function DispatchOrderCard({ order, orgSlug }: DispatchOrderCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";

  function handleDeliver() {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "DELIVERED",
        extraFields: {
          delivered_at: new Date().toISOString(),
        },
      });

      if (result.success) {
        toast.success("Pedido marcado como entregado");
        router.refresh();
      } else {
        toast.error(`Error al actualizar: ${result.error}`);
      }
    });
  }

  const canDeliver = order.status === "DISPATCHED";

  return (
    <Card className="overflow-hidden transition-shadow">
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-mono font-semibold text-sm">
            {order.order_number}
          </span>
          <OrderStatusBadge status={order.status} />
          <span className="truncate text-muted-foreground text-sm">
            {customerName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <CalendarIcon className="h-3.5 w-3.5" />
            {formatDate(order.created_at ?? undefined, {
              month: "short",
              day: "numeric",
            } as Intl.DateTimeFormatOptions)}
          </span>
          {quote && (
            <span className="font-medium text-sm">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          {canDeliver && (
            <Button
              disabled={isPending}
              onClick={handleDeliver}
              size="sm"
              variant="default"
            >
              <CheckCircleIcon className="mr-1 h-4 w-4" />
              {isPending ? "Entregando..." : "Marcar entregado"}
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
