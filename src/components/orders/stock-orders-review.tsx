"use client";

import {
  ArrowElbowDownRightIcon,
  ArrowFatLineLeftIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import { confirmStockReviewAction } from "@/modules/orders/actions/confirm-stock-review.action";
import { createChildOrderAction } from "@/modules/orders/actions/create-child-order.action";
import { directTransitionAction } from "@/modules/orders/actions/direct-transition.action";
import { getItemSupplierCountAction } from "@/modules/orders/actions/get-item-supplier-count.action";
import { getStockForOrderAction } from "@/modules/orders/actions/get-stock-for-order.action";
import type { OrdersRevertInfoMap } from "@/modules/orders/service/orders.service";
import {
  type ChildOrderRoute,
  type OrderFlowStatus,
  type OrderWithChildren,
  type PurchasingOrder,
  type StockInfo,
  stripRouteFromObservations,
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
            <PurchasingCard key={order.id} order={order} orgSlug={orgSlug} />
          ))}
        </div>
      )}
    </div>
  );
}

type PurchasingCardProps = {
  order: PurchasingOrder;
  orgSlug: string;
};

function PurchasingCard({ order, orgSlug }: PurchasingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="overflow-hidden opacity-75 transition-shadow">
      <CardHeader
        className="flex cursor-pointer flex-row items-center gap-2 py-2.5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${order.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {order.order_number}
        </Link>
        {order.purchase_order_id && order.purchase_order_number && (
          <Link
            className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            href={`/org/${orgSlug}/compras/${order.purchase_order_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {order.purchase_order_number}
          </Link>
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
  const [selectedQuantities, setSelectedQuantities] = useState<
    Map<string, number>
  >(new Map());
  const selectedQuantitiesRef = useRef(selectedQuantities);
  selectedQuantitiesRef.current = selectedQuantities;
  const [selectedRoute, setSelectedRoute] = useState<ChildOrderRoute>("direct");
  const [childNotes, setChildNotes] = useState("");
  const childNotesRef = useRef(childNotes);
  childNotesRef.current = childNotes;
  const [pendingDirectTransition, setPendingDirectTransition] = useState(false);

  const prevChildrenLenRef = useRef(order.children.length);
  useEffect(() => {
    if (order.children.length !== prevChildrenLenRef.current) {
      setSelectedQuantities(new Map());
      setSelectedRoute("direct");
      prevChildrenLenRef.current = order.children.length;
    }
  }, [order.children.length]);

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

  const { data: supplierCount = 0 } = useQuery({
    queryKey: [
      "quote-item-suppliers",
      orgSlug,
      Array.from(selectedQuantities.keys()),
    ],
    queryFn: () =>
      getItemSupplierCountAction(
        orgSlug,
        Array.from(selectedQuantities.keys())
      ),
    enabled: selectedRoute === "purchase" && selectedQuantities.size > 0,
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
      Array.from(selectedQuantities.keys()).some((id) => {
        const item = selectableItems.find((i) => i.id === id);
        return item?.assigned_order_id != null;
      }),
    [selectedQuantities, selectableItems]
  );

  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every(
      (i) =>
        selectedQuantities.has(i.id) &&
        selectedQuantities.get(i.id) === i.quantity
    );

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
      (i) => selectedQuantities.has(i.id) && i.assigned_order_id != null
    );
    return item?.assigned_order_id ?? undefined;
  }, [hasGoodsReceivedSelected, selectableItems, selectedQuantities]);

  useEffect(() => {
    if (hasGoodsReceivedSelected && selectedRoute === "purchase") {
      setSelectedRoute("direct");
    }
  }, [hasGoodsReceivedSelected, selectedRoute]);

  const setItemQuantity = useCallback((itemId: string, quantity: number) => {
    setSelectedQuantities((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) {
        next.delete(itemId);
      } else {
        next.set(itemId, quantity);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedQuantities(new Map());
    } else {
      const next = new Map<string, number>();
      for (const item of selectableItems) {
        next.set(item.id, item.quantity);
      }
      setSelectedQuantities(next);
    }
  }, [allSelected, selectableItems]);

  const submitCreateChild = useCallback(async () => {
    if (isDirectTransition) {
      setPendingDirectTransition(true);
      return;
    }

    const currentQuantities = selectedQuantitiesRef.current;
    const selectedIds = Array.from(currentQuantities.keys());

    const selectedWithSource = selectableItems.filter(
      (i) => currentQuantities.has(i.id) && i.assigned_order_id != null
    );

    const allFromGoodsReceived =
      selectedWithSource.length > 0 &&
      selectedWithSource.every(
        (i) =>
          i.assigned_order_id && goodsReceivedChildIds.has(i.assigned_order_id)
      );

    const source = allFromGoodsReceived
      ? undefined
      : selectableItems.find(
          (i) => currentQuantities.has(i.id) && i.assigned_order_id != null
        );
    const sourceId = source?.assigned_order_id ?? undefined;

    const quantitiesObj = Object.fromEntries(currentQuantities);

    const result = await createChildOrderAction({
      orgSlug,
      parentOrderId: order.id,
      quoteItemIds: selectedIds,
      route: selectedRoute,
      sourceChildOrderId: sourceId,
      observations: childNotesRef.current || null,
      skipParentRecalc: true,
      quantities: quantitiesObj,
    });

    if (!result.success) {
      toast.error(`Error al crear pedido hijo: ${result.error}`);
      return;
    }

    if (result.childOrders) {
      for (const child of result.childOrders) {
        toast.success(`Pedido ${child.childOrderNumber} creado`);
      }
    } else {
      toast.success(`Pedido hijo ${result.childOrderNumber} creado`);
    }

    setSelectedQuantities(new Map());
    setChildNotes("");
    router.refresh();
  }, [
    orgSlug,
    order.id,
    selectedRoute,
    selectableItems,
    goodsReceivedChildIds,
    router,
    isDirectTransition,
  ]);

  const handleDirectConfirm = useCallback(async () => {
    const result = await directTransitionAction({
      orgSlug,
      orderId: order.id,
      quoteItemIds: Array.from(selectedQuantitiesRef.current.keys()),
      route: selectedRoute,
      observations: childNotesRef.current || null,
    });

    if (!result.success) {
      toast.error(`Error al confirmar: ${result.error}`);
      return;
    }

    const routeLabel =
      ROUTE_OPTIONS.find((r) => r.value === selectedRoute)?.label ??
      selectedRoute;
    toast.success(`Pedido enviado a ${routeLabel}`);
    setSelectedQuantities(new Map());
    setChildNotes("");
    setPendingDirectTransition(false);
    router.refresh();
  }, [orgSlug, order.id, selectedRoute, router]);

  const handleSubmit = useCallback(() => {
    if (selectedQuantitiesRef.current.size === 0) {
      return;
    }

    startTransition(async () => {
      await submitCreateChild();
    });
  }, [submitCreateChild]);

  const noSelectable = selectableItems.length === 0;
  const noAssigned = assignedItems.length === 0;
  const allAssigned = noSelectable && !noAssigned;

  const routeLabel =
    ROUTE_OPTIONS.find((r) => r.value === selectedRoute)?.label ??
    selectedRoute;

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
          <Link
            className="font-mono font-semibold text-sm hover:underline"
            href={`/org/${orgSlug}/pedidos/${order.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {order.order_number}
          </Link>
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
        <StockOrderCardBody
          allAssigned={allAssigned}
          allSelected={allSelected}
          assignedByChild={assignedByChild}
          availableRoutes={availableRoutes}
          childMap={childMap}
          childNotes={childNotes}
          goodsReceivedChildIds={goodsReceivedChildIds}
          handleDirectConfirm={handleDirectConfirm}
          handleSubmit={handleSubmit}
          isDirectTransition={isDirectTransition}
          isLoadingStock={isLoadingStock}
          isPending={isPending}
          itemStockMap={itemStockMap}
          noAssigned={noAssigned}
          noSelectable={noSelectable}
          order={order}
          orgSlug={orgSlug}
          pendingDirectTransition={pendingDirectTransition}
          revertInfoMap={revertInfoMap}
          routeLabel={routeLabel}
          selectableItems={selectableItems}
          selectedQuantities={selectedQuantities}
          selectedRoute={selectedRoute}
          setChildNotes={setChildNotes}
          setItemQuantity={setItemQuantity}
          setPendingDirectTransition={setPendingDirectTransition}
          setSelectedRoute={setSelectedRoute}
          supplierCount={supplierCount}
          toggleAll={toggleAll}
        />
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

type StockOrderCardBodyProps = {
  allAssigned: boolean;
  allSelected: boolean;
  assignedByChild: Map<string, QuoteItem[]>;
  availableRoutes: { value: ChildOrderRoute; label: string }[];
  childMap: Map<string, OrderWithChildren["children"][number]>;
  childNotes: string;
  goodsReceivedChildIds: Set<string>;
  handleDirectConfirm: () => Promise<void>;
  handleSubmit: () => void;
  isDirectTransition: boolean;
  isLoadingStock: boolean;
  isPending: boolean;
  itemStockMap: Map<string, StockInfo | undefined>;
  noAssigned: boolean;
  noSelectable: boolean;
  order: OrderWithChildren;
  orgSlug: string;
  pendingDirectTransition: boolean;
  revertInfoMap: OrdersRevertInfoMap;
  routeLabel: string;
  selectableItems: QuoteItem[];
  selectedQuantities: Map<string, number>;
  selectedRoute: ChildOrderRoute;
  setChildNotes: (notes: string) => void;
  setItemQuantity: (itemId: string, quantity: number) => void;
  setPendingDirectTransition: (v: boolean) => void;
  setSelectedRoute: (route: ChildOrderRoute) => void;
  supplierCount: number;
  toggleAll: () => void;
};

function StockOrderCardBody({
  allAssigned,
  allSelected,
  assignedByChild,
  availableRoutes,
  childMap,
  childNotes,
  goodsReceivedChildIds,
  handleDirectConfirm,
  handleSubmit,
  isDirectTransition,
  isLoadingStock,
  isPending,
  itemStockMap,
  noAssigned,
  noSelectable,
  order,
  orgSlug,
  pendingDirectTransition,
  revertInfoMap,
  routeLabel,
  selectableItems,
  selectedQuantities,
  selectedRoute,
  setChildNotes,
  setItemQuantity,
  setPendingDirectTransition,
  setSelectedRoute,
  supplierCount,
  toggleAll,
}: StockOrderCardBodyProps) {
  return (
    <CardContent className="space-y-6 pt-4">
      {!(noSelectable || pendingDirectTransition) && (
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
          onItemQuantityChange={setItemQuantity}
          onRouteChange={setSelectedRoute}
          onSubmit={handleSubmit}
          onToggleAll={toggleAll}
          selectedQuantities={selectedQuantities}
          selectedRoute={selectedRoute}
          supplierCount={supplierCount}
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

      {pendingDirectTransition && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Transición directa</h4>
          <p className="text-muted-foreground text-sm">
            Todos los items del pedido serán enviados a{" "}
            <span className="font-medium">{routeLabel}</span>. Confirmá la
            revisión para completar.
          </p>
        </div>
      )}

      {noSelectable && noAssigned && !pendingDirectTransition && (
        <p className="py-4 text-center text-muted-foreground text-sm">
          Este pedido no tiene items.
        </p>
      )}

      {allAssigned && !pendingDirectTransition && (
        <ConfirmReviewBar orderId={order.id} orgSlug={orgSlug} />
      )}
      {pendingDirectTransition && (
        <ConfirmReviewBar
          isPending={isPending}
          onCancel={() => setPendingDirectTransition(false)}
          onConfirm={handleDirectConfirm}
          orderId={order.id}
          orgSlug={orgSlug}
        />
      )}
    </CardContent>
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

type ItemRowProps = {
  item: QuoteItem;
  stock: StockInfo | undefined;
  enteredQty: number;
  isPending: boolean;
  isGoods: boolean;
  onQuantityChange: (itemId: string, quantity: number) => void;
};

function ItemRow({
  item,
  stock,
  enteredQty,
  isPending,
  isGoods,
  onQuantityChange,
}: ItemRowProps) {
  const hasStock = stock?.has_stock ?? false;
  const exceedsStock =
    stock !== undefined && enteredQty > stock.stock_available;

  return (
    <tr className="border-b last:border-0">
      <td className="w-10 py-1.5 pr-2">
        <Checkbox
          aria-label={`Seleccionar ${item.description || item.id}`}
          checked={enteredQty > 0}
          onCheckedChange={() => {
            onQuantityChange(item.id, enteredQty > 0 ? 0 : item.quantity);
          }}
        />
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-2">
          <span>{stock?.product_name ?? item.description ?? "—"}</span>
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
      <td className="px-2 py-1.5 text-right tabular-nums">{item.quantity}</td>
      <td className="px-2 py-1.5">
        <div className="flex justify-center">
          <input
            className={cn(
              "h-8 w-16 rounded-md border bg-background px-2 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              exceedsStock && "border-rose-400 focus-visible:ring-rose-400"
            )}
            disabled={isPending}
            max={item.quantity}
            min={0}
            onBlur={(e) => {
              const val = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(val) || val < 0) {
                onQuantityChange(item.id, 0);
              } else if (val > item.quantity) {
                onQuantityChange(item.id, item.quantity);
              }
            }}
            onChange={(e) => {
              const val = Number.parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) {
                onQuantityChange(item.id, Math.max(0, val));
              }
            }}
            placeholder="0"
            type="number"
            value={enteredQty || ""}
          />
        </div>
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums">
        {stock !== undefined ? (
          <span
            className={
              hasStock ? "text-emerald-600" : "font-medium text-rose-600"
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
}

type UnassignedItemsSectionProps = {
  allSelected: boolean;
  childNotes: string;
  goodsReceivedChildIds: Set<string>;
  isDirectTransition: boolean;
  isPending: boolean;
  isLoadingStock: boolean;
  items: readonly QuoteItem[];
  selectedQuantities: Map<string, number>;
  selectedRoute: ChildOrderRoute;
  itemStockMap: Map<string, StockInfo | undefined>;
  availableRoutes: { value: ChildOrderRoute; label: string }[];
  supplierCount: number;
  onChildNotesChange: (notes: string) => void;
  onItemQuantityChange: (itemId: string, quantity: number) => void;
  onRouteChange: (route: ChildOrderRoute) => void;
  onSubmit: () => void;
  onToggleAll: () => void;
};

function UnassignedItemsSection({
  allSelected,
  childNotes,
  goodsReceivedChildIds,
  isDirectTransition,
  isPending,
  isLoadingStock,
  items,
  selectedQuantities,
  selectedRoute,
  itemStockMap,
  availableRoutes,
  supplierCount,
  onChildNotesChange,
  onItemQuantityChange,
  onRouteChange,
  onSubmit,
  onToggleAll,
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
    for (const [id, qty] of selectedQuantities) {
      const stock = itemStockMap.get(id);
      if (stock !== undefined && stock.stock_available < qty) {
        return true;
      }
    }
    return false;
  }, [selectedRoute, selectedQuantities, itemStockMap]);

  const selectedCount = selectedQuantities.size;

  let buttonLabel: string;
  if (isPending) {
    buttonLabel = isDirectTransition ? "Enviando..." : "Creando...";
  } else if (isDirectTransition) {
    buttonLabel = `Enviar a ${routeLabel}`;
  } else {
    buttonLabel = `Enviar a ${routeLabel} (${selectedCount})`;
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
                <th className="px-2 pb-1.5 text-center font-medium">Enviar</th>
                <th className="pb-1.5 pl-2 text-right font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  enteredQty={selectedQuantities.get(item.id) ?? 0}
                  isGoods={isGoodsReceivedItem(item)}
                  isPending={isPending}
                  item={item}
                  key={item.id}
                  onQuantityChange={onItemQuantityChange}
                  stock={itemStockMap.get(item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCount > 0 && (
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
          {supplierCount > 1 && selectedRoute === "purchase" && (
            <p className="text-right text-amber-600 text-xs">
              Items de {supplierCount} proveedores distintos. Se crearán órdenes
              de compra separadas.
            </p>
          )}
          {hasInsufficientStock && (
            <p className="text-right text-rose-600 text-xs">
              Hay items sin stock suficiente. Cambie a ruta "Compra" o reduzca
              las cantidades de los items sin stock.
            </p>
          )}
          <Button
            disabled={selectedCount === 0 || isPending || hasInsufficientStock}
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
        <Link
          className="font-mono font-semibold text-sm hover:underline"
          href={`/org/${orgSlug}/pedidos/${childId}`}
        >
          {child?.order_number ?? childId.slice(0, 8)}
        </Link>
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
            {childItems.map((item) => {
              const variant = item.product_variants;
              const suffix = variant
                ? ` - ${variant.talle} / ${variant.color}`
                : "";
              const productName =
                variant && item.description?.endsWith(suffix)
                  ? item.description.slice(0, -suffix.length)
                  : item.description;
              return (
                <tr className="border-b last:border-0" key={item.id}>
                  <td className="py-1 pr-2">{productName ?? "—"}</td>
                  <td className="px-2 py-1">
                    {variant ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                        {variant.talle} / {variant.color}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums">
                    {item.quantity}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {child?.observations &&
          stripRouteFromObservations(child.observations) && (
            <div className="mt-2 rounded-md bg-muted/30 px-3 py-2">
              <p className="text-muted-foreground text-xs">Observaciones</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">
                {stripRouteFromObservations(child.observations)}
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

type ConfirmReviewBarProps = {
  orgSlug: string;
  orderId: string;
  isPending?: boolean;
  onConfirm?: () => Promise<void>;
  onCancel?: () => void;
};

function ConfirmReviewBar({
  orgSlug,
  orderId,
  isPending: externalPending,
  onConfirm: externalConfirm,
  onCancel,
}: ConfirmReviewBarProps) {
  const router = useRouter();
  const [internalPending, startTransition] = useTransition();
  const isPending = externalPending ?? internalPending;

  const handleConfirm = useCallback(() => {
    if (externalConfirm) {
      externalConfirm();
      return;
    }

    startTransition(async () => {
      const result = await confirmStockReviewAction(orgSlug, orderId);

      if (!result.success) {
        toast.error(`Error al confirmar revisión: ${result.error}`);
        return;
      }

      toast.success("Revisión de stock confirmada");
      router.refresh();
    });
  }, [orgSlug, orderId, router, externalConfirm]);

  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        Presione el botón de volver atrás para liberar los items o presione
        confirmar para enviar los items a su ruta seleccionada.
      </p>
      <div className="flex items-center gap-2">
        {onCancel && (
          <Button
            className="border-destructive/30 text-destructive hover:bg-destructive/15 hover:text-destructive"
            disabled={isPending}
            onClick={onCancel}
            size="sm"
            variant="outline"
          >
            <ArrowFatLineLeftIcon className="size-4" />
            Volver atrás
          </Button>
        )}
        <Button disabled={isPending} onClick={handleConfirm} size="sm">
          <CheckCircleIcon className="size-4" weight="fill" />
          {isPending ? "Confirmando..." : "Confirmar revisión"}
        </Button>
      </div>
    </div>
  );
}
