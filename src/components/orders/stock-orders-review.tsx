"use client";

import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  PackageIcon,
  ShoppingCartIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
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
import { cn } from "@/lib/utils";
import { getStockForOrderAction } from "@/modules/orders/actions/get-stock-for-order.action";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type {
  OrderFlowStatus,
  OrderWithDetails,
  StockInfo,
} from "@/modules/orders/types";
import { VALID_TRANSITIONS } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

const TRANSITION_CONFIG: Partial<
  Record<
    OrderFlowStatus,
    { label: string; icon: React.ComponentType<{ className?: string }> }
  >
> = {
  STOCK_OK: { label: "Stock OK", icon: CheckCircleIcon },
  PURCHASE_REQUIRED: { label: "Requiere compra", icon: ShoppingCartIcon },
  PURCHASING: { label: "En compra", icon: ShoppingCartIcon },
  GOODS_RECEIVED: { label: "Recibido", icon: PackageIcon },
  IN_PRODUCTION: { label: "A producción", icon: CheckCircleIcon },
  CANCELLED: { label: "Cancelar pedido", icon: XCircleIcon },
};

type StockOrdersReviewProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
};

export function StockOrdersReview({ orders, orgSlug }: StockOrdersReviewProps) {
  const stockOrders = orders.filter((o) =>
    [
      "PENDING_STOCK",
      "STOCK_OK",
      "PURCHASE_REQUIRED",
      "PURCHASING",
      "GOODS_RECEIVED",
    ].includes(o.status)
  );

  if (stockOrders.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin pedidos en esta etapa</EmptyTitle>
            <EmptyDescription>
              No hay pedidos pendientes de revisión de stock.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stockOrders.map((order) => (
        <StockOrderCard key={order.id} order={order} orgSlug={orgSlug} />
      ))}
    </div>
  );
}

type StockOrderCardProps = {
  order: OrderWithDetails;
  orgSlug: string;
};

function StockOrderCard({ order, orgSlug }: StockOrderCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [stockNotes, setStockNotes] = useState("");

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const validTargets = VALID_TRANSITIONS[order.status] ?? [];

  const { stockInfo, isLoadingStock } = useLoadStock({
    orgSlug,
    quote,
    isExpanded,
  });
  const allStockOk = computeStockStatus(stockInfo);

  const handleTransition = useCallback(
    (targetStatus: OrderFlowStatus) => {
      startTransition(async () => {
        const result = await updateOrderStatusAction({
          orgSlug,
          orderId: order.id,
          newStatus: targetStatus,
          notes: stockNotes,
        });

        if (result.success) {
          toast.success("Pedido actualizado");
          router.refresh();
        } else {
          toast.error(`Error al actualizar el pedido: ${result.error}`);
        }
      });
    },
    [orgSlug, order.id, stockNotes, router]
  );

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
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          <div className="flex items-center gap-2">
            {quote && (
              <span className="font-medium text-sm">
                {formatCurrency(quote.total_amount, quote.currency)}
              </span>
            )}
            <span className="whitespace-nowrap text-muted-foreground text-xs">
              {formatDate(order.created_at ?? undefined, {
                month: "short",
                day: "numeric",
              } as Intl.DateTimeFormatOptions)}
            </span>
          </div>
          {isExpanded ? (
            <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-4">
          <StockItemsSection
            allStockOk={allStockOk}
            isLoadingStock={isLoadingStock}
            quote={quote}
            stockInfo={stockInfo}
          />

          <div>
            <label
              className="mb-1 block font-medium text-sm"
              htmlFor={`stock-notes-${order.id}`}
            >
              Notas de stock
            </label>
            <Textarea
              id={`stock-notes-${order.id}`}
              onChange={(e) => setStockNotes(e.target.value)}
              placeholder="Notas de stock..."
              value={stockNotes}
            />
          </div>

          {validTargets.length > 0 && (
            <TransitionButtons
              isPending={isPending}
              onTransition={handleTransition}
              validTargets={validTargets}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function useLoadStock({
  orgSlug,
  quote,
  isExpanded,
}: {
  orgSlug: string;
  quote: OrderWithDetails["quotes"];
  isExpanded: boolean;
}) {
  const [stockInfo, setStockInfo] = useState<StockInfo[] | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  useEffect(() => {
    if (!isExpanded || stockInfo !== null || !quote) {
      return;
    }

    const items = quote.quote_items.filter(
      (i): i is typeof i & { product_id: string } => i.product_id !== null
    );

    if (items.length === 0) {
      setStockInfo([]);
      return;
    }

    setIsLoadingStock(true);
    getStockForOrderAction(
      orgSlug,
      items.map((i) => ({
        productId: i.product_id,
        quantityNeeded: i.quantity,
      }))
    )
      .then(setStockInfo)
      .catch(() => setStockInfo([]))
      .finally(() => setIsLoadingStock(false));
  }, [isExpanded, stockInfo, orgSlug, quote]);

  return { stockInfo, isLoadingStock };
}

function computeStockStatus(stockInfo: StockInfo[] | null): boolean | null {
  return stockInfo !== null && stockInfo.length > 0
    ? stockInfo.every((s) => s.has_stock)
    : null;
}

type StockItemsSectionProps = {
  quote: OrderWithDetails["quotes"];
  isLoadingStock: boolean;
  stockInfo: StockInfo[] | null;
  allStockOk: boolean | null;
};

function StockItemsSection({
  quote,
  isLoadingStock,
  stockInfo,
  allStockOk,
}: StockItemsSectionProps) {
  if (!quote || quote.quote_items.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="mb-2 font-medium text-sm">Items del pedido</h4>

      {isLoadingStock && (
        <div className="space-y-2 py-2">
          <div className="h-3 animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-700/60" />
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-700/60" />
        </div>
      )}

      {!isLoadingStock && stockInfo !== null && (
        <StockTable allStockOk={allStockOk} stockInfo={stockInfo} />
      )}

      {!isLoadingStock && stockInfo === null && (
        <p className="py-2 text-muted-foreground text-sm">
          {quote.quote_items.some((i) => i.product_id)
            ? "No se pudo consultar el stock."
            : "Los items de este pedido no tienen productos asociados."}
        </p>
      )}
    </div>
  );
}

function StockTable({
  stockInfo,
  allStockOk,
}: {
  stockInfo: StockInfo[];
  allStockOk: boolean | null;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pr-2 pb-1.5 text-left font-medium">Producto</th>
              <th className="px-2 pb-1.5 text-right font-medium">Necesario</th>
              <th className="px-2 pb-1.5 text-right font-medium">Stock</th>
              <th className="pb-1.5 pl-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {stockInfo.length === 0 && (
              <tr>
                <td
                  className="py-3 text-center text-muted-foreground"
                  colSpan={4}
                >
                  No se pudo verificar el stock de estos productos.
                </td>
              </tr>
            )}
            {stockInfo.map((s, index) => (
              <tr
                className="border-b last:border-0"
                key={`${s.product_id}-${index}`}
              >
                <td className="py-1.5 pr-2">{s.product_name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {s.quantity_needed}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {s.stock_available}
                </td>
                <td className="py-1.5 pl-2 text-right">
                  {s.has_stock ? (
                    <CheckCircleIcon className="ml-auto size-4 text-emerald-600" />
                  ) : (
                    <XCircleIcon className="ml-auto size-4 text-rose-600" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allStockOk === true && (
        <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
          <CheckCircleIcon className="size-4 shrink-0" />
          Stock suficiente
        </div>
      )}
      {allStockOk === false && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 text-sm">
          <WarningCircleIcon className="size-4 shrink-0" />
          Stock insuficiente
        </div>
      )}
    </div>
  );
}

function TransitionButtons({
  isPending,
  validTargets,
  onTransition,
}: {
  isPending: boolean;
  validTargets: OrderFlowStatus[];
  onTransition: (target: OrderFlowStatus) => void;
}) {
  const normalTargets = validTargets.filter((t) => t !== "CANCELLED");
  const showCancel = validTargets.includes("CANCELLED");

  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      {showCancel && (
        <Button
          disabled={isPending}
          onClick={() => onTransition("CANCELLED")}
          variant="destructive"
        >
          <XCircleIcon className="size-4" />
          {isPending ? "Cancelando..." : "Cancelar pedido"}
        </Button>
      )}
      {normalTargets.length > 0 && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {normalTargets.map((targetStatus) => {
            const config = TRANSITION_CONFIG[targetStatus];
            if (!config) {
              return null;
            }
            const Icon = config.icon;
            return (
              <Button
                disabled={isPending}
                key={targetStatus}
                onClick={() => onTransition(targetStatus)}
                variant="default"
              >
                <Icon className="size-4" />
                {isPending ? `${config.label}...` : config.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
