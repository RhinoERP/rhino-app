"use client";

import {
  CaretRightIcon,
  CheckCircleIcon,
  FileTextIcon,
  ScissorsIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
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
  const productionOrders = orders.filter(
    (o) => o.status === "IN_PRODUCTION" || o.status === "DESIGN_REVIEW"
  );

  if (productionOrders.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScissorsIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin pedidos en producción</EmptyTitle>
            <EmptyDescription>
              No hay pedidos en producción o revisión de diseño.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {productionOrders.map((order) => (
        <ProductionOrderCard key={order.id} order={order} orgSlug={orgSlug} />
      ))}
    </div>
  );
}

type ProductionOrderCardProps = {
  order: OrderWithDetails;
  orgSlug: string;
};

function ProductionOrderCard({ order, orgSlug }: ProductionOrderCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [productionNotes, setProductionNotes] = useState("");

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const itemCount = quote?.quote_items.length ?? 0;
  const isDesignReview = order.status === "DESIGN_REVIEW";
  const bocetoLabel = isDesignReview ? "Ver boceto" : "Crear boceto";
  const actionLabel = isDesignReview
    ? "Aprobar y enviar a Despacho"
    : "Marcar boceto listo";

  function handleAction() {
    const newStatus = isDesignReview ? "PREPARING" : "DESIGN_REVIEW";

    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus,
        notes: productionNotes,
      });

      if (result.success) {
        toast.success("Pedido actualizado");
        setProductionNotes("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  }

  return (
    <Card className="overflow-hidden transition-shadow">
      <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-mono font-semibold text-sm">
            {order.order_number}
          </span>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button asChild disabled={isPending} variant="outline">
            <Link href={`/org/${orgSlug}/produccion/${order.id}/boceto`}>
              <FileTextIcon className="size-4" />
              {bocetoLabel}
            </Link>
          </Button>
          <Button disabled={isPending} onClick={handleAction} variant="default">
            {isDesignReview ? (
              <CheckCircleIcon className="size-4" />
            ) : (
              <CaretRightIcon className="size-4" />
            )}
            {isPending ? "Procesando..." : actionLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Cliente:</span>{" "}
            {customerName}
          </span>
          {quote && (
            <span>
              <span className="text-muted-foreground">Monto:</span>{" "}
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          <span>
            <span className="text-muted-foreground">Items:</span> {itemCount}
          </span>
          <span>
            <span className="text-muted-foreground">Fecha:</span>{" "}
            {formatDate(order.created_at ?? undefined, {
              month: "short",
              day: "numeric",
            } as Intl.DateTimeFormatOptions)}
          </span>
        </div>

        <div>
          <label
            className="mb-1 block font-medium text-sm"
            htmlFor={`production-notes-${order.id}`}
          >
            Notas de producción
          </label>
          <Textarea
            id={`production-notes-${order.id}`}
            onChange={(e) => setProductionNotes(e.target.value)}
            placeholder="Notas sobre la producción..."
            value={productionNotes}
          />
        </div>
      </CardContent>
    </Card>
  );
}
