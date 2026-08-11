"use client";

import {
  ArrowElbowDownRight,
  ArrowFatLineLeftIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckCircleIcon,
  EyeIcon,
  FileTextIcon,
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
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrdersRevertInfoMap } from "@/modules/orders/service/orders.service";
import type { ChildOrderForProduction } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";
import { RevertOrderModal } from "./revert-order-modal";

type ProductionOrdersListProps = {
  orders: ChildOrderForProduction[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

export function ProductionOrdersList({
  orders,
  orgSlug,
  revertInfoMap,
}: ProductionOrdersListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ChildOrderForProduction[]>();
    for (const o of orders) {
      const group = map.get(o.parent_order_id);
      if (group) {
        group.push(o);
      } else {
        map.set(o.parent_order_id, [o]);
      }
    }
    return map;
  }, [orders]);

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
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([parentId, groupOrders]) => (
        <ParentGroup
          key={parentId}
          orders={groupOrders}
          orgSlug={orgSlug}
          parentId={parentId}
          revertInfoMap={revertInfoMap}
        />
      ))}
    </div>
  );
}

type ParentGroupProps = {
  parentId: string;
  orders: ChildOrderForProduction[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

function ParentGroup({
  parentId,
  orders,
  orgSlug,
  revertInfoMap,
}: ParentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const first = orders[0];
  const isUnified = orders.length === 1 && orders[0].id === parentId;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className={cn(
          "cursor-pointer gap-2 sm:flex-row sm:items-center sm:justify-between",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium text-sm">
            {first.parent_customer_name}
          </span>
          <Link
            className="shrink-0 font-mono text-muted-foreground text-xs hover:underline"
            href={`/org/${orgSlug}/pedidos/${parentId}`}
            onClick={(e) => e.stopPropagation()}
          >
            {first.parent_order_number}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {!isUnified && (
            <span className="text-muted-foreground text-xs">
              {orders.length} {orders.length === 1 ? "envío" : "envíos"}
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
        <CardContent className="space-y-3 pt-4">
          {orders.map((child) => (
            <ProductionChildCard
              child={child}
              key={child.id}
              orgSlug={orgSlug}
              revertInfo={revertInfoMap[child.id]}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

type ProductionChildCardProps = {
  child: ChildOrderForProduction;
  orgSlug: string;
  revertInfo: OrdersRevertInfoMap[string] | undefined;
};

function ProductionChildCard({
  child,
  orgSlug,
  revertInfo,
}: ProductionChildCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [productionNotes, setProductionNotes] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";
  const isDesignReview = child.status === "DESIGN_REVIEW";
  const itemCount = child.items.length;

  function handleSendToProduction() {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: child.id,
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
        orderId: child.id,
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
    <Card className="border-dashed">
      <CardHeader
        className={cn(
          "flex cursor-pointer flex-row items-center gap-2 py-2.5",
          isExpanded && "border-b"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ArrowElbowDownRight className="size-4 shrink-0 text-muted-foreground" />
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${child.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {child.order_number}
        </Link>
        <OrderStatusBadge status={child.status} />
        <span className="text-muted-foreground text-xs">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        <div className="flex-1" />
        {isExpanded ? (
          <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0 pb-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Cliente:</span>{" "}
              {child.parent_customer_name}
            </span>
            <span>
              <span className="text-muted-foreground">Items:</span> {itemCount}
            </span>
            <span>
              <span className="text-muted-foreground">Fecha:</span>{" "}
              {formatDate(child.created_at ?? undefined, {
                month: "short",
                day: "numeric",
              } as Intl.DateTimeFormatOptions)}
            </span>
          </div>

          {child.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pr-2 pb-1 text-left font-medium">
                      Producto
                    </th>
                    <th className="pb-1 pl-2 text-right font-medium">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {child.items.map((item) => (
                    <tr className="border-b last:border-0" key={item.id}>
                      <td className="py-1 pr-2">{item.description}</td>
                      <td className="py-1 pl-2 text-right tabular-nums">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isDesignReview && (
            <div>
              <label
                className="mb-1 block font-medium text-sm"
                htmlFor={`production-notes-${child.id}`}
              >
                Notas de producción
              </label>
              <Textarea
                id={`production-notes-${child.id}`}
                onChange={(e) => setProductionNotes(e.target.value)}
                placeholder="Notas sobre la producción..."
                value={productionNotes}
              />
            </div>
          )}

          <ProductionChildActions
            canRevert={canRevert}
            hasBoceto={child.has_boceto}
            isDesignReview={isDesignReview}
            isPending={isPending}
            onRevert={() => setRevertOpen(true)}
            onSendToDispatch={handleSendToDispatch}
            onSendToProduction={handleSendToProduction}
            orderId={child.id}
            orgSlug={orgSlug}
          />

          {canRevert && previousStatus && previousStatusLabel && (
            <RevertOrderModal
              onOpenChange={setRevertOpen}
              onSuccess={() => {
                router.refresh();
              }}
              open={revertOpen}
              orderId={child.id}
              orderNumber={child.order_number}
              orgSlug={orgSlug}
              previousStatus={previousStatus}
              previousStatusLabel={previousStatusLabel}
              revertType={revertType}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

type ProductionChildActionsProps = {
  canRevert: boolean;
  hasBoceto: boolean;
  isDesignReview: boolean;
  isPending: boolean;
  orgSlug: string;
  orderId: string;
  onRevert: () => void;
  onSendToDispatch: () => void;
  onSendToProduction: () => void;
};

function ProductionChildActions({
  canRevert,
  hasBoceto,
  isDesignReview,
  isPending,
  orgSlug,
  orderId,
  onRevert,
  onSendToDispatch,
  onSendToProduction,
}: ProductionChildActionsProps) {
  if (isDesignReview) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
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
        {canRevert && (
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
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {hasBoceto ? (
        <Button asChild variant="outline">
          <Link
            href={`/org/${orgSlug}/produccion/${orderId}/boceto`}
            onClick={(e) => e.stopPropagation()}
          >
            <EyeIcon className="size-4" />
            Ver boceto
          </Link>
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
        {isPending ? "Procesando..." : "Enviar a personalización/bordado"}
      </Button>
      {canRevert && (
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
      )}
    </div>
  );
}
