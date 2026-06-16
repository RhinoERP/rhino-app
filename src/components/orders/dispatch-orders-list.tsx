"use client";

import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  PackageIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrderWithDispatch } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type DispatchOrdersListProps = {
  orders: OrderWithDispatch[];
  orgSlug: string;
};

export function DispatchOrdersList({
  orders,
  orgSlug,
}: DispatchOrdersListProps) {
  const preparing = orders.filter((o) => o.status === "PREPARING");
  const dispatched = orders.filter((o) => o.status === "DISPATCHED");
  const delivered = orders.filter((o) => o.status === "DELIVERED");

  if (
    preparing.length === 0 &&
    dispatched.length === 0 &&
    delivered.length === 0
  ) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon className="size-6" weight="duotone" />
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
    <div className="space-y-8">
      <DispatchSection
        count={preparing.length}
        icon={PackageIcon}
        title="Preparando"
      >
        {preparing.map((order) => (
          <DispatchOrderCard key={order.id} order={order} orgSlug={orgSlug} />
        ))}
      </DispatchSection>

      <DispatchSection
        count={dispatched.length}
        icon={TruckIcon}
        title="Despachados"
      >
        {dispatched.map((order) => (
          <DispatchOrderCard key={order.id} order={order} orgSlug={orgSlug} />
        ))}
      </DispatchSection>

      <DispatchSection
        count={delivered.length}
        icon={CheckCircleIcon}
        title="Entregados"
      >
        {delivered.map((order) => (
          <DispatchOrderCard key={order.id} order={order} orgSlug={orgSlug} />
        ))}
      </DispatchSection>
    </div>
  );
}

type DispatchSectionProps = {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
};

function DispatchSection({
  title,
  icon: Icon,
  count,
  children,
}: DispatchSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" weight="duotone" />
        <h2 className="font-heading font-semibold text-lg">{title}</h2>
        <span className="ml-auto inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 font-medium text-xs tabular-nums">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function DeliveredOrderCard({ order }: { order: OrderWithDispatch }) {
  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";

  return (
    <Card className="overflow-hidden opacity-70 transition-shadow">
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
          {order.tracking_number && (
            <span className="text-muted-foreground text-xs">
              Tracking: {order.tracking_number}
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            {formatDate(order.delivered_at ?? undefined, {
              month: "short",
              day: "numeric",
            } as Intl.DateTimeFormatOptions)}
          </span>
          {quote && (
            <span className="font-medium text-sm">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

type DispatchContentProps = {
  order: OrderWithDispatch;
  orgSlug: string;
};

function PreparingContent({ order, orgSlug }: DispatchContentProps) {
  const [isPending, startTransition] = useTransition();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const quote = order.quotes;

  function handleConfirmDispatch() {
    if (!trackingNumber.trim()) {
      toast.error("El número de tracking es obligatorio");
      return;
    }
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "DISPATCHED",
        notes: dispatchNotes,
        trackingNumber,
      });

      if (result.success) {
        toast.success("Pedido despachado correctamente");
      } else {
        toast.error(`Error al despachar: ${result.error}`);
      }
    });
  }

  return (
    <>
      {quote && quote.quote_items.length > 0 && (
        <div>
          <h4 className="mb-2 font-medium text-sm">Items del pedido</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pr-2 pb-1.5 text-left font-medium">
                    Descripción
                  </th>
                  <th className="px-2 pb-1.5 text-right font-medium">Cant.</th>
                  <th className="pb-1.5 pl-2 text-right font-medium">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {quote.quote_items.map((item) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="py-1.5 pr-2">{item.description}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">
                      {formatCurrency(item.subtotal, quote.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <label
          className="mb-1 block font-medium text-sm"
          htmlFor={`tracking-${order.id}`}
        >
          Número de seguimiento
        </label>
        <Input
          id={`tracking-${order.id}`}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="Ingresá el número de tracking..."
          value={trackingNumber}
        />
      </div>

      <div>
        <label
          className="mb-1 block font-medium text-sm"
          htmlFor={`dispatch-notes-${order.id}`}
        >
          Notas de despacho
        </label>
        <Textarea
          id={`dispatch-notes-${order.id}`}
          onChange={(e) => setDispatchNotes(e.target.value)}
          placeholder="Notas adicionales sobre el despacho..."
          value={dispatchNotes}
        />
      </div>

      <div className="flex justify-end">
        <Button
          disabled={isPending}
          onClick={handleConfirmDispatch}
          size="sm"
          variant="default"
        >
          <TruckIcon className="mr-1 h-4 w-4" />
          {isPending ? "Despachando..." : "Confirmar despacho"}
        </Button>
      </div>
    </>
  );
}

function DispatchedContent({ order, orgSlug }: DispatchContentProps) {
  const [isPending, startTransition] = useTransition();
  const [deliveryNotes, setDeliveryNotes] = useState("");

  function handleConfirmDelivery() {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "DELIVERED",
        notes: deliveryNotes,
      });

      if (result.success) {
        toast.success("Entrega confirmada al cliente");
      } else {
        toast.error(`Error al confirmar entrega: ${result.error}`);
      }
    });
  }

  return (
    <>
      {order.tracking_number && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">Número de seguimiento:</span>{" "}
          {order.tracking_number}
        </div>
      )}
      {order.dispatch_notes && (
        <div className="text-sm">
          <span className="font-medium">Notas de despacho:</span>
          <p className="mt-1 text-muted-foreground">{order.dispatch_notes}</p>
        </div>
      )}
      {order.dispatched_at && (
        <div className="text-muted-foreground text-sm">
          Despachado el {formatDate(order.dispatched_at ?? undefined)}
        </div>
      )}

      <div>
        <label
          className="mb-1 block font-medium text-sm"
          htmlFor={`delivery-notes-${order.id}`}
        >
          Notas de entrega
        </label>
        <Textarea
          id={`delivery-notes-${order.id}`}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          placeholder="Notas sobre la entrega..."
          value={deliveryNotes}
        />
      </div>

      <div className="flex justify-end">
        <Button
          disabled={isPending}
          onClick={handleConfirmDelivery}
          size="sm"
          variant="default"
        >
          <CheckCircleIcon className="mr-1 h-4 w-4" />
          {isPending ? "Confirmando..." : "Confirmar entrega al cliente"}
        </Button>
      </div>
    </>
  );
}

type DispatchOrderCardProps = {
  order: OrderWithDispatch;
  orgSlug: string;
};

function DispatchOrderCard({ order, orgSlug }: DispatchOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const isDispatched = order.status === "DISPATCHED";

  if (order.status === "DELIVERED") {
    return <DeliveredOrderCard order={order} />;
  }

  return (
    <Card className="overflow-hidden transition-shadow">
      <CardHeader
        className={cn(
          "cursor-pointer gap-2 sm:flex-row sm:items-center sm:justify-between",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
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
          {isDispatched && order.tracking_number && (
            <span className="text-muted-foreground text-xs">
              Tracking: {order.tracking_number}
            </span>
          )}
          {quote && (
            <span className="font-medium text-sm">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          {isExpanded ? (
            <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-4">
          {order.status === "PREPARING" ? (
            <PreparingContent order={order} orgSlug={orgSlug} />
          ) : (
            <DispatchedContent order={order} orgSlug={orgSlug} />
          )}
        </CardContent>
      )}
    </Card>
  );
}
