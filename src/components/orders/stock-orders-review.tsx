"use client";

import {
  ArrowElbowDownRightIcon,
  ArrowFatLineLeftIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createChildOrderAction } from "@/modules/orders/actions/create-child-order.action";
import { createPurchaseDraftAction } from "@/modules/orders/actions/create-purchase-draft.action";
import { getStockForOrderAction } from "@/modules/orders/actions/get-stock-for-order.action";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrdersRevertInfoMap } from "@/modules/orders/service/orders.service";
import type {
  ChildOrderRoute,
  OrderFlowStatus,
  OrderWithChildren,
  PurchasingOrder,
  StockInfo,
} from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";
import { RevertOrderModal } from "./revert-order-modal";

const ROUTE_OPTIONS: { value: ChildOrderRoute; label: string }[] = [
  { value: "direct", label: "Despacho" },
  { value: "production", label: "Producción" },
  { value: "purchase", label: "Compra" },
];

const ROUTE_FROM_STATUS: Partial<Record<OrderFlowStatus, string>> = {
  PREPARING: "Despacho",
  DISPATCHED: "Despacho",
  DELIVERED: "Despacho",
  IN_PRODUCTION: "Producción",
  DESIGN_REVIEW: "Producción",
  PURCHASE_REQUIRED: "Compra",
  PURCHASING: "Compra",
  GOODS_RECEIVED: "Compra",
};

const ROUTE_TO_STATUS: Record<ChildOrderRoute, OrderFlowStatus> = {
  direct: "PREPARING",
  production: "IN_PRODUCTION",
  purchase: "PURCHASE_REQUIRED",
};

function getRouteLabel(status: OrderFlowStatus): string | null {
  return ROUTE_FROM_STATUS[status] ?? null;
}

function stockKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

type StockOrdersReviewProps = {
  purchasingOrders?: PurchasingOrder[];
  orders: OrderWithChildren[];
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

export function StockOrdersReview({
  purchasingOrders,
  orders,
  orgSlug,
  revertInfoMap,
}: StockOrdersReviewProps) {
  const hasPendingStock = orders.length > 0;
  const hasPurchasing = (purchasingOrders?.length ?? 0) > 0;

  if (!(hasPendingStock || hasPurchasing)) {
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
    <div className="space-y-8">
      {hasPendingStock && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg">Pendientes de revisión</h2>
          {orders.map((order) => (
            <StockOrderCard
              key={order.id}
              order={order}
              orgSlug={orgSlug}
              revertInfoMap={revertInfoMap}
            />
          ))}
        </div>
      )}

      {hasPurchasing && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg">En compra</h2>
          {purchasingOrders?.map((order) => (
            <PurchasingCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

type PurchasingCardProps = {
  order: PurchasingOrder;
};

function PurchasingCard({ order }: PurchasingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="overflow-hidden opacity-75 transition-shadow">
      <CardHeader
        className="flex cursor-pointer flex-row items-center gap-2 py-2.5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-mono font-semibold text-sm">
          {order.order_number}
        </span>
        {order.purchase_order_number && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs dark:bg-slate-800">
            {order.purchase_order_number}
          </span>
        )}
        <OrderStatusBadge status={order.status} />
        <span className="truncate text-muted-foreground text-sm">
          {order.parent_customer_name}
        </span>
        <div className="flex-1" />
        {isExpanded ? (
          <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-3">
          <div className="divide-y rounded-md border">
            <div className="grid grid-cols-[1fr_80px] gap-4 px-4 py-2 font-medium text-muted-foreground text-xs">
              <span>Producto</span>
              <span className="text-right">Cantidad</span>
            </div>
            {order.items.map((item) => (
              <div
                className="grid grid-cols-[1fr_80px] gap-4 px-4 py-2 text-sm"
                key={item.id}
              >
                <span>{item.description}</span>
                <span className="text-right">{item.quantity}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

type StockOrderCardProps = {
  order: OrderWithChildren;
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

function StockOrderCard({
  order,
  orgSlug,
  revertInfoMap,
}: StockOrderCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [revertOpen, setRevertOpen] = useState(false);
  const parentRevertInfo = revertInfoMap[order.id];
  const parentCanRevert = parentRevertInfo?.canRevert ?? false;
  const parentPreviousStatus = parentRevertInfo?.previousStatus ?? null;
  const parentPreviousStatusLabel = parentRevertInfo?.previousLabel ?? null;
  const parentRevertType = parentRevertInfo?.revertType ?? "normal";
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );
  const selectedIdsRef = useRef(selectedItemIds);
  selectedIdsRef.current = selectedItemIds;
  const [selectedRoute, setSelectedRoute] = useState<ChildOrderRoute>("direct");
  const [childNotes, setChildNotes] = useState("");
  const childNotesRef = useRef(childNotes);
  childNotesRef.current = childNotes;

  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";

  const goodsReceivedChildIds = useMemo(
    () =>
      new Set(
        order.children
          .filter((c) => c.status === "GOODS_RECEIVED")
          .map((c) => c.id)
      ),
    [order.children]
  );

  const unassignedItems = useMemo(
    () => quote?.quote_items.filter((i) => !i.assigned_order_id) ?? [],
    [quote]
  );
  const goodsReceivedItems = useMemo(
    () =>
      quote?.quote_items.filter(
        (i) =>
          i.assigned_order_id && goodsReceivedChildIds.has(i.assigned_order_id)
      ) ?? [],
    [quote, goodsReceivedChildIds]
  );
  const assignedItems = useMemo(
    () =>
      quote?.quote_items.filter(
        (i) =>
          i.assigned_order_id && !goodsReceivedChildIds.has(i.assigned_order_id)
      ) ?? [],
    [quote, goodsReceivedChildIds]
  );

  const selectableItems = useMemo(
    () => [...unassignedItems, ...goodsReceivedItems],
    [unassignedItems, goodsReceivedItems]
  );

  const assignedByChild = useMemo(() => {
    const map = new Map<string, (typeof assignedItems)[number][]>();
    const withChildId = assignedItems.filter(
      (i): i is typeof i & { assigned_order_id: string } =>
        i.assigned_order_id !== null
    );
    for (const item of withChildId) {
      const group = map.get(item.assigned_order_id);
      if (group) {
        group.push(item);
      } else {
        map.set(item.assigned_order_id, [item]);
      }
    }
    return map;
  }, [assignedItems]);

  const childMap = useMemo(() => {
    const map = new Map<string, OrderWithChildren["children"][number]>();
    for (const child of order.children) {
      map.set(child.id, child);
    }
    return map;
  }, [order.children]);

  const { stockInfo, isLoadingStock } = useLoadStockForItems({
    orgSlug,
    items: selectableItems,
    isExpanded,
  });

  const stockMap = useMemo(() => {
    const map = new Map<string, StockInfo>();
    if (stockInfo) {
      for (const s of stockInfo) {
        map.set(stockKey(s.product_id, s.variant_id), s);
      }
    }
    return map;
  }, [stockInfo]);

  const itemStockMap = useMemo(() => {
    const map = new Map<string, StockInfo | undefined>();
    for (const item of selectableItems) {
      const key = item.product_id
        ? stockKey(item.product_id, item.product_variant_id)
        : undefined;
      map.set(item.id, key ? stockMap.get(key) : undefined);
    }
    return map;
  }, [selectableItems, stockMap]);

  const hasGoodsReceivedSelected = useMemo(
    () =>
      Array.from(selectedItemIds).some((id) => {
        const item = selectableItems.find((i) => i.id === id);
        return item?.assigned_order_id != null;
      }),
    [selectedItemIds, selectableItems]
  );

  const allSelected =
    selectableItems.length > 0 &&
    selectedItemIds.size === selectableItems.length;

  const isDirectTransition =
    allSelected &&
    assignedItems.length === 0 &&
    goodsReceivedItems.length === 0;

  const availableRoutes = useMemo(() => {
    if (hasGoodsReceivedSelected) {
      return ROUTE_OPTIONS.filter((r) => r.value !== "purchase");
    }
    return ROUTE_OPTIONS;
  }, [hasGoodsReceivedSelected]);

  const _sourceChildOrderId = useMemo(() => {
    if (!hasGoodsReceivedSelected) {
      return;
    }
    const item = selectableItems.find(
      (i) => selectedItemIds.has(i.id) && i.assigned_order_id != null
    );
    return item?.assigned_order_id ?? undefined;
  }, [hasGoodsReceivedSelected, selectableItems, selectedItemIds]);

  useEffect(() => {
    if (hasGoodsReceivedSelected && selectedRoute === "purchase") {
      setSelectedRoute("direct");
    }
  }, [hasGoodsReceivedSelected, selectedRoute]);

  const toggleItem = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(selectableItems.map((i) => i.id)));
    }
  }, [allSelected, selectableItems]);

  const submitDirectTransition = useCallback(
    async (routeLabel: string) => {
      const newStatus = ROUTE_TO_STATUS[selectedRoute];

      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus,
        notes: `Pedido enviado a ${routeLabel} sin división`,
        observations: childNotesRef.current || null,
      });

      if (!result.success) {
        toast.error(`Error al enviar pedido: ${result.error}`);
        return;
      }

      if (selectedRoute === "purchase") {
        const draftResult = await createPurchaseDraftAction(
          orgSlug,
          order.id,
          Array.from(selectedIdsRef.current)
        );
        if (!draftResult.success) {
          toast.error(`Error al crear pre-compra: ${draftResult.error}`);
        }
      }

      toast.success(`Pedido enviado a ${routeLabel}`);
      setSelectedItemIds(new Set());
      setChildNotes("");
      router.refresh();
    },
    [orgSlug, order.id, selectedRoute, router]
  );

  const submitCreateChild = useCallback(async () => {
    const source = selectableItems.find(
      (i) => selectedIdsRef.current.has(i.id) && i.assigned_order_id != null
    );
    const sourceId = source?.assigned_order_id ?? undefined;

    const result = await createChildOrderAction({
      orgSlug,
      parentOrderId: order.id,
      quoteItemIds: Array.from(selectedIdsRef.current),
      route: selectedRoute,
      sourceChildOrderId: sourceId,
      observations: childNotesRef.current || null,
    });

    if (!result.success) {
      toast.error(`Error al crear pedido hijo: ${result.error}`);
      return;
    }

    toast.success(`Pedido hijo ${result.childOrderNumber} creado`);
    setSelectedItemIds(new Set());
    setChildNotes("");
    router.refresh();
  }, [orgSlug, order.id, selectedRoute, selectableItems, router]);

  const handleSubmit = useCallback(() => {
    if (selectedIdsRef.current.size === 0) {
      return;
    }

    const hasGoods = Array.from(selectedIdsRef.current).some((id) => {
      const item = selectableItems.find((i) => i.id === id);
      return item?.assigned_order_id != null;
    });

    const isDirect =
      selectedIdsRef.current.size === selectableItems.length &&
      assignedItems.length === 0 &&
      !hasGoods;

    const routeLabel =
      ROUTE_OPTIONS.find((r) => r.value === selectedRoute)?.label ??
      selectedRoute;

    startTransition(async () => {
      if (isDirect) {
        await submitDirectTransition(routeLabel);
      } else {
        await submitCreateChild();
      }
    });
  }, [
    selectedRoute,
    selectableItems,
    assignedItems,
    submitDirectTransition,
    submitCreateChild,
  ]);

  const noSelectable = selectableItems.length === 0;
  const noAssigned = assignedItems.length === 0;

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
        <StockOrderCardActions
          isExpanded={isExpanded}
          onRevert={() => setRevertOpen(true)}
          order={order}
          parentCanRevert={parentCanRevert}
          quote={quote}
        />
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6 pt-4">
          {!noSelectable && (
            <UnassignedItemsSection
              allSelected={allSelected}
              availableRoutes={availableRoutes}
              childNotes={childNotes}
              goodsReceivedChildIds={goodsReceivedChildIds}
              isDirectTransition={isDirectTransition}
              isLoadingStock={isLoadingStock}
              isPending={isPending}
              itemStockMap={itemStockMap}
              items={selectableItems}
              onChildNotesChange={setChildNotes}
              onRouteChange={setSelectedRoute}
              onSubmit={handleSubmit}
              onToggleAll={toggleAll}
              onToggleItem={toggleItem}
              selectedItemIds={selectedItemIds}
              selectedRoute={selectedRoute}
            />
          )}

          {!noAssigned && (
            <AssignedItemsSection
              assignedByChild={assignedByChild}
              childMap={childMap}
              orgSlug={orgSlug}
              revertInfoMap={revertInfoMap}
            />
          )}

          {noSelectable && noAssigned && (
            <p className="py-4 text-center text-muted-foreground text-sm">
              Este pedido no tiene items.
            </p>
          )}
        </CardContent>
      )}
      {parentCanRevert && parentPreviousStatus && parentPreviousStatusLabel && (
        <RevertOrderModal
          childCount={order.children.length}
          onOpenChange={setRevertOpen}
          onSuccess={() => router.refresh()}
          open={revertOpen}
          orderId={order.id}
          orderNumber={order.order_number}
          orgSlug={orgSlug}
          previousStatus={parentPreviousStatus}
          previousStatusLabel={parentPreviousStatusLabel}
          revertType={parentRevertType}
        />
      )}
    </Card>
  );
}

type StockOrderCardActionsProps = {
  isExpanded: boolean;
  onRevert: () => void;
  order: OrderWithChildren;
  parentCanRevert: boolean;
  quote: OrderWithChildren["quotes"];
};

function StockOrderCardActions({
  isExpanded,
  onRevert,
  order,
  parentCanRevert,
  quote,
}: StockOrderCardActionsProps) {
  return (
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
        {parentCanRevert && (
          <Button
            className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
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
        )}
      </div>
      {isExpanded ? (
        <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}

type QuoteItem = NonNullable<
  OrderWithChildren["quotes"]
>["quote_items"][number];

function useLoadStockForItems({
  orgSlug,
  items,
  isExpanded,
}: {
  orgSlug: string;
  items: readonly QuoteItem[];
  isExpanded: boolean;
}) {
  const [stockInfo, setStockInfo] = useState<StockInfo[] | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const validItems = items.filter(
      (i): i is typeof i & { product_id: string } => i.product_id !== null
    );

    if (validItems.length === 0) {
      setStockInfo([]);
      return;
    }

    setIsLoadingStock(true);
    getStockForOrderAction(
      orgSlug,
      validItems.map((i) => ({
        productId: i.product_id,
        quantityNeeded: i.quantity,
        productVariantId: i.product_variant_id,
      }))
    )
      .then((result) => {
        setStockInfo(result);
      })
      .catch(() => setStockInfo([]))
      .finally(() => setIsLoadingStock(false));
  }, [isExpanded, orgSlug, items]);

  return { stockInfo, isLoadingStock };
}

type UnassignedItemsSectionProps = {
  allSelected: boolean;
  childNotes: string;
  goodsReceivedChildIds: Set<string>;
  isDirectTransition: boolean;
  isPending: boolean;
  isLoadingStock: boolean;
  items: readonly QuoteItem[];
  selectedItemIds: Set<string>;
  selectedRoute: ChildOrderRoute;
  itemStockMap: Map<string, StockInfo | undefined>;
  availableRoutes: { value: ChildOrderRoute; label: string }[];
  onChildNotesChange: (notes: string) => void;
  onToggleAll: () => void;
  onToggleItem: (itemId: string) => void;
  onRouteChange: (route: ChildOrderRoute) => void;
  onSubmit: () => void;
};

function UnassignedItemsSection({
  allSelected,
  childNotes,
  goodsReceivedChildIds,
  isDirectTransition,
  isPending,
  isLoadingStock,
  items,
  selectedItemIds,
  selectedRoute,
  itemStockMap,
  availableRoutes,
  onChildNotesChange,
  onToggleAll,
  onToggleItem,
  onRouteChange,
  onSubmit,
}: UnassignedItemsSectionProps) {
  const routeLabel =
    availableRoutes.find((r) => r.value === selectedRoute)?.label ??
    selectedRoute;

  const isGoodsReceivedItem = useCallback(
    (item: QuoteItem) =>
      item.assigned_order_id != null &&
      goodsReceivedChildIds.has(item.assigned_order_id),
    [goodsReceivedChildIds]
  );

  const hasInsufficientStock = useMemo(() => {
    if (selectedRoute === "purchase") {
      return false;
    }
    return Array.from(selectedItemIds).some((id) => {
      const stock = itemStockMap.get(id);
      return stock !== undefined && !stock.has_stock;
    });
  }, [selectedRoute, selectedItemIds, itemStockMap]);

  let buttonLabel: string;
  if (isPending) {
    buttonLabel = isDirectTransition ? "Enviando..." : "Creando...";
  } else if (isDirectTransition) {
    buttonLabel = `Enviar a ${routeLabel}`;
  } else {
    buttonLabel = `Enviar a ${routeLabel} (${selectedItemIds.size})`;
  }

  return (
    <div>
      <h4 className="mb-3 font-medium text-sm">Items sin asignar</h4>

      {isLoadingStock && (
        <div className="space-y-2 py-2">
          <div className="h-3 animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-700/60" />
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-700/60" />
        </div>
      )}

      {!isLoadingStock && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="w-10 pr-2 pb-1.5 text-left font-medium">
                  <Checkbox
                    aria-label="Seleccionar todos"
                    checked={allSelected}
                    onCheckedChange={onToggleAll}
                  />
                </th>
                <th className="pr-2 pb-1.5 text-left font-medium">Producto</th>
                <th className="px-2 pb-1.5 text-left font-medium">Variante</th>
                <th className="px-2 pb-1.5 text-right font-medium">
                  Necesario
                </th>
                <th className="pb-1.5 pl-2 text-right font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const stock = itemStockMap.get(item.id);
                const hasStock = stock?.has_stock ?? false;
                const isGoods = isGoodsReceivedItem(item);

                return (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="w-10 py-1.5 pr-2">
                      <Checkbox
                        aria-label={`Seleccionar ${item.description || item.id}`}
                        checked={selectedItemIds.has(item.id)}
                        onCheckedChange={() => onToggleItem(item.id)}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span>
                          {stock?.product_name ?? item.description ?? "—"}
                        </span>
                        {isGoods && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 text-xs dark:bg-teal-900/30 dark:text-teal-400">
                            <CheckCircleIcon className="size-3" weight="fill" />
                            Mercadería recibida
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {stock?.variant_talle ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                          {stock.variant_talle} / {stock.variant_color}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">
                      {stock !== undefined ? (
                        <span
                          className={
                            hasStock
                              ? "text-emerald-600"
                              : "font-medium text-rose-600"
                          }
                        >
                          {stock.stock_available}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {item.product_id ? "—" : "sin producto"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedItemIds.size > 0 && (
        <div className="mt-4">
          <label
            className="mb-1 block font-medium text-muted-foreground text-xs"
            htmlFor="child-observations"
          >
            Observaciones
          </label>
          <textarea
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="child-observations"
            onChange={(e) => onChildNotesChange(e.target.value)}
            placeholder="Observaciones..."
            rows={2}
            value={childNotes}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-sm">Ruta:</span>
          <div className="flex gap-1">
            {availableRoutes.map((opt) => (
              <Button
                disabled={isPending}
                key={opt.value}
                onClick={() => onRouteChange(opt.value)}
                size="sm"
                variant={selectedRoute === opt.value ? "default" : "outline"}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {hasInsufficientStock && (
            <p className="text-right text-rose-600 text-xs">
              Hay items sin stock suficiente. Cambie a ruta "Compra" o quite los
              items sin stock de la selección.
            </p>
          )}
          <Button
            disabled={
              selectedItemIds.size === 0 || isPending || hasInsufficientStock
            }
            onClick={onSubmit}
            size="sm"
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

type AssignedItemsSectionProps = {
  assignedByChild: Map<string, QuoteItem[]>;
  childMap: Map<string, OrderWithChildren["children"][number]>;
  orgSlug: string;
  revertInfoMap: OrdersRevertInfoMap;
};

function AssignedItemsSection({
  assignedByChild,
  childMap,
  orgSlug,
  revertInfoMap,
}: AssignedItemsSectionProps) {
  return (
    <div>
      <h4 className="mb-3 font-medium text-sm">Items en ruta</h4>

      <div className="space-y-3">
        {Array.from(assignedByChild.entries()).map(([childId, childItems]) => {
          const child = childMap.get(childId);
          const routeLabel = child ? getRouteLabel(child.status) : null;

          return (
            <ChildCard
              child={child}
              childId={childId}
              childItems={childItems}
              key={childId}
              orgSlug={orgSlug}
              revertInfoMap={revertInfoMap}
              routeLabel={routeLabel}
            />
          );
        })}
      </div>
    </div>
  );
}

type ChildCardProps = {
  child: OrderWithChildren["children"][number] | undefined;
  childId: string;
  childItems: QuoteItem[];
  orgSlug: string;
  routeLabel: string | null;
  revertInfoMap: OrdersRevertInfoMap;
};

function ChildCard({
  child,
  childId,
  childItems,
  orgSlug,
  routeLabel,
  revertInfoMap,
}: ChildCardProps) {
  const router = useRouter();
  const [revertOpen, setRevertOpen] = useState(false);
  const revertInfo = revertInfoMap[childId];
  const canRevert = revertInfo?.canRevert ?? false;
  const previousStatus = revertInfo?.previousStatus ?? null;
  const previousStatusLabel = revertInfo?.previousLabel ?? null;
  const revertType = revertInfo?.revertType ?? "normal";

  return (
    <Card className="border-dashed" key={childId}>
      <CardHeader className="flex flex-row items-center gap-2 py-2.5">
        <ArrowElbowDownRightIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-mono font-semibold text-sm">
          {child?.order_number ?? childId.slice(0, 8)}
        </span>
        {child && <OrderStatusBadge status={child.status} />}
        {routeLabel && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
            {routeLabel}
          </span>
        )}
        <div className="flex-1" />
        {canRevert && (
          <Button
            className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
            onClick={() => setRevertOpen(true)}
            size="sm"
            variant="outline"
          >
            <ArrowFatLineLeftIcon className="size-4" />
            Volver atrás
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0 pb-2.5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pr-2 pb-1 text-left font-medium">Producto</th>
              <th className="px-2 pb-1 text-left font-medium">Variante</th>
              <th className="pb-1 pl-2 text-right font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {childItems.map((item) => (
              <tr className="border-b last:border-0" key={item.id}>
                <td className="py-1 pr-2">{item.description ?? "—"}</td>
                <td className="px-2 py-1">
                  <span className="text-muted-foreground text-xs">—</span>
                </td>
                <td className="py-1 pl-2 text-right tabular-nums">
                  {item.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {child?.observations && (
          <div className="mt-2 rounded-md bg-muted/30 px-3 py-2">
            <p className="text-muted-foreground text-xs">Observaciones</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">
              {child.observations}
            </p>
          </div>
        )}
      </CardContent>
      {canRevert && previousStatus && previousStatusLabel && (
        <RevertOrderModal
          onOpenChange={setRevertOpen}
          onSuccess={() => router.refresh()}
          open={revertOpen}
          orderId={childId}
          orderNumber={child?.order_number ?? childId.slice(0, 8)}
          orgSlug={orgSlug}
          previousStatus={previousStatus}
          previousStatusLabel={previousStatusLabel}
          revertType={revertType}
        />
      )}
    </Card>
  );
}
