"use client";

import {
  ArrowFatLineLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  EyeIcon,
  FileTextIcon,
  ScissorsIcon,
} from "@phosphor-icons/react";
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
import type { OrdersRevertInfoMap } from "@/modules/orders/service/orders.service";
import type { OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";
import { RevertOrderModal } from "./revert-order-modal";

type ProductionOrdersListProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

export function ProductionOrdersList({
  orders,
  orgSlug,
  revertInfoMap,
}: ProductionOrdersListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScissorsIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin pedidos en producción</EmptyTitle>
            <EmptyDescription>
              No hay pedidos en producción o producción externa.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <ProductionOrderCard
          key={order.id}
          order={order}
          orgSlug={orgSlug}
          revertInfo={revertInfoMap[order.id]}
        />
      ))}
    </div>
  );
}

type ProductionOrderCardProps = {
  order: OrderWithDetails;
  orgSlug: string;
  revertInfo: OrdersRevertInfoMap[string] | undefined;
};

function ProductionOrderCard({
  order,
  orgSlug,
  revertInfo,
}: ProductionOrderCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [productionNotes, setProductionNotes] = useState("");
  const [revertOpen, setRevertOpen] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const itemCount = quote?.quote_items.length ?? 0;
  const isDesignReview = order.status === "DESIGN_REVIEW";

  const designRef = order.order_designs?.products?.[0]?.reference_image ?? null;

  function handleSendToProduction() {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "DESIGN_REVIEW",
        notes: productionNotes,
      });

      if (result.success) {
        toast.success("Pedido enviado a producción externa");
        setProductionNotes("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  }

  function handleSendToDispatch() {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus: "PREPARING",
      });

      if (result.success) {
        toast.success("Pedido enviado a despacho");
        router.refresh();
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  }

  return (
    <Card className="overflow-hidden transition-shadow">
      <ProductionOrderActions
        canRevert={canRevert}
        designRef={designRef}
        isDesignReview={isDesignReview}
        isPending={isPending}
        onRevert={() => setRevertOpen(true)}
        onSendToDispatch={handleSendToDispatch}
        onSendToProduction={handleSendToProduction}
        order={order}
      />
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

        {!isDesignReview && (
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
        )}
      </CardContent>

      {canRevert && previousStatus && previousStatusLabel && (
        <RevertOrderModal
          onOpenChange={setRevertOpen}
          onSuccess={() => {
            router.refresh();
          }}
          open={revertOpen}
          orderId={order.id}
          orderNumber={order.order_number}
          orgSlug={orgSlug}
          previousStatus={previousStatus}
          previousStatusLabel={previousStatusLabel}
          revertType={revertType}
        />
      )}
    </Card>
  );
}

type ProductionOrderActionsProps = {
  canRevert: boolean;
  designRef: string | null;
  isDesignReview: boolean;
  isPending: boolean;
  onRevert: () => void;
  onSendToDispatch: () => void;
  onSendToProduction: () => void;
  order: OrderWithDetails;
};

function ProductionOrderActions({
  canRevert,
  designRef,
  isDesignReview,
  isPending,
  onRevert,
  onSendToDispatch,
  onSendToProduction,
  order,
}: ProductionOrderActionsProps) {
  const revertButton = canRevert ? (
    <Button
      className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
      disabled={isPending}
      onClick={onRevert}
      size="sm"
      variant="outline"
    >
      <ArrowFatLineLeftIcon className="size-4" />
      Volver atrás
    </Button>
  ) : null;

  return (
    <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-mono font-semibold text-sm">
          {order.order_number}
        </span>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {isDesignReview ? (
          <>
            <Button
              disabled={isPending}
              onClick={onSendToDispatch}
              variant="default"
            >
              <CheckCircleIcon className="size-4" />
              {isPending ? "Procesando..." : "Enviar a despacho"}
            </Button>
            {revertButton}
          </>
        ) : (
          <>
            {designRef ? (
              <Button asChild variant="outline">
                <a href={designRef} rel="noopener noreferrer" target="_blank">
                  <EyeIcon className="size-4" />
                  Ver boceto
                </a>
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-muted-foreground text-xs">
                <FileTextIcon className="size-4" />
                Sin boceto adjunto
              </span>
            )}
            <Button
              disabled={isPending}
              onClick={onSendToProduction}
              variant="default"
            >
              <CaretRightIcon className="size-4" />
              {isPending ? "Procesando..." : "Enviar a producción"}
            </Button>
            {revertButton}
          </>
        )}
      </div>
    </CardHeader>
  );
}
