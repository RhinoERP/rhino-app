"use client";

import {
  ArrowFatLineLeftIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckCircleIcon,
  EyeIcon,
  FileTextIcon,
  PackageIcon,
  ScissorsIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";

  const assignedItems = useMemo(
    () =>
      (quote?.quote_items ?? []).filter(
        (item) =>
          item.assigned_order_id === order.id ||
          (item.assigned_order_id === null && !order.parent_order_id)
      ),
    [quote, order.id, order.parent_order_id]
  );
  const itemCount = assignedItems.length;
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
        isExpanded={isExpanded}
        isPending={isPending}
        onRevert={() => setRevertOpen(true)}
        onSendToDispatch={handleSendToDispatch}
        onSendToProduction={handleSendToProduction}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        order={order}
        orgSlug={orgSlug}
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

        {isExpanded && assignedItems.length > 0 && (
          <div className="divide-y rounded-md border">
            <div className="grid grid-cols-[1fr_80px_100px] gap-4 px-4 py-2 font-medium text-muted-foreground text-xs">
              <span>Producto</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">P. Unitario</span>
            </div>
            {assignedItems.map((item) => (
              <div
                className="grid grid-cols-[1fr_80px_100px] gap-4 px-4 py-2 text-sm"
                key={item.id}
              >
                <span className="flex items-center gap-2">
                  <PackageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  {item.description}
                </span>
                <span className="text-right tabular-nums">{item.quantity}</span>
                <span className="text-right tabular-nums">
                  {formatCurrency(item.unit_price ?? 0, quote?.currency)}
                </span>
              </div>
            ))}
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
  isExpanded: boolean;
  isPending: boolean;
  onRevert: () => void;
  onSendToDispatch: () => void;
  onSendToProduction: () => void;
  onToggleExpand: () => void;
  order: OrderWithDetails;
  orgSlug: string;
};

function ProductionOrderActions({
  canRevert,
  designRef,
  isDesignReview,
  isExpanded,
  isPending,
  onRevert,
  onSendToDispatch,
  onSendToProduction,
  onToggleExpand,
  order,
  orgSlug,
}: ProductionOrderActionsProps) {
  const revertButton = canRevert ? (
    <Button
      className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation();
        onRevert();
      }}
      size="sm"
      variant="outline"
    >
      <ArrowFatLineLeftIcon className="size-4" />
      Volver atrás
    </Button>
  ) : null;

  return (
    <CardHeader
      className="cursor-pointer gap-2 sm:flex-row sm:items-center sm:justify-between"
      onClick={onToggleExpand}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${order.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {order.order_number}
        </Link>
        <OrderStatusBadge status={order.status} />
        <div className="ml-auto flex items-center gap-1 sm:hidden">
          {isExpanded ? (
            <CaretUpIcon className="size-4 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
        {isExpanded ? (
          <CaretUpIcon className="size-4 text-muted-foreground" />
        ) : (
          <CaretDownIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {isDesignReview ? (
          <>
            <Button
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onSendToDispatch();
              }}
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
                <a
                  href={designRef}
                  onClick={(e) => e.stopPropagation()}
                  rel="noopener noreferrer"
                  target="_blank"
                >
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
              onClick={(e) => {
                e.stopPropagation();
                onSendToProduction();
              }}
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
