"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CaretDownIcon,
  CaretRightIcon,
  FilePdfIcon,
  FileTextIcon,
  ReceiptIcon,
  TruckIcon,
  UserIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RemittancePreviewButton } from "@/components/sales/remittance-preview-button";
import { ItemExtrasList } from "@/components/shared/item-extras-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadOrderRemittanceAction } from "@/modules/orders/actions/download-order-remittance.action";
import { generateOrderRemittanceAction } from "@/modules/orders/actions/generate-order-remittance.action";
import type { OrderDispatchEventSummary } from "@/modules/orders/actions/get-order-dispatch-events.action";
import { useOrderDispatchEvents } from "@/modules/orders/hooks/use-order-dispatch-events";
import type {
  ChildOrderRoute,
  OrderFlowStatus,
  OrderWithChildren,
} from "@/modules/orders/types";
import { stripRouteFromObservations } from "@/modules/orders/types";
import { CancelOrderModal } from "./cancel-order-modal";
import { OrderFlowTimeline } from "./order-flow-timeline";
import { OrderStatusBadge } from "./order-status-badge";

type OrderDetailClientProps = {
  orgSlug: string;
  order: OrderWithChildren;
};

const ROUTE_LABEL: Record<ChildOrderRoute, string> = {
  direct: "Despacho",
  production: "Producción",
  purchase: "Compra",
};

function ChildRemitoCell({
  ev,
  isDownloading,
  isGenerating,
  onDownload,
  onGenerate,
}: {
  ev: OrderDispatchEventSummary;
  isDownloading: boolean;
  isGenerating: boolean;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (childOrderId: string, remitoNumber: string) => void;
}) {
  return (
    <td className="px-4 py-2">
      <div className="flex items-center gap-1">
        {ev.remittance_pdf_url ? (
          <>
            <RemittancePreviewButton
              label="Ver"
              pdfUrl={ev.remittance_pdf_url}
            />
            <Button
              disabled={isDownloading}
              onClick={() => onDownload(ev.child_order_id, ev.remito_number)}
              size="sm"
              type="button"
              variant="outline"
            >
              {isDownloading ? <Spinner className="size-3" /> : "Descargar"}
            </Button>
          </>
        ) : (
          <Button
            disabled={isGenerating}
            onClick={() => onGenerate(ev.child_order_id, ev.remito_number)}
            size="sm"
            type="button"
            variant="outline"
          >
            {isGenerating ? <Spinner className="size-3" /> : "Generar"}
          </Button>
        )}
      </div>
    </td>
  );
}

function ChildOrderRow({
  child,
  ev,
  isDownloading,
  isGenerating,
  onDownload,
  onGenerate,
  orgSlug,
}: {
  child: OrderWithChildren["children"][number];
  ev: OrderDispatchEventSummary | undefined;
  isDownloading: boolean;
  isGenerating: boolean;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (childOrderId: string, remitoNumber: string) => void;
  orgSlug: string;
}) {
  return (
    <tr className="border-b last:border-0" key={child.id}>
      <td className="py-2 pr-4 font-medium">
        <Link
          className="hover:underline"
          href={`/org/${orgSlug}/pedidos/${child.id}`}
        >
          {child.order_number}
        </Link>
      </td>
      <td className="px-4 py-2">
        {child.order_number
          ? ROUTE_LABEL[child.order_number.split("-").at(-2) as ChildOrderRoute]
          : "\u2014"}
      </td>
      <td className="px-4 py-2">
        <OrderStatusBadge status={child.status} />
      </td>
      <td className="max-w-[150px] truncate px-4 py-2 text-muted-foreground text-xs">
        {stripRouteFromObservations(child.observations) || "\u2014"}
      </td>
      {ev ? (
        <ChildRemitoCell
          ev={ev}
          isDownloading={isDownloading}
          isGenerating={isGenerating}
          onDownload={onDownload}
          onGenerate={onGenerate}
        />
      ) : (
        <td className="px-4 py-2">
          <span className="text-muted-foreground text-xs">{"\u2014"}</span>
        </td>
      )}
      <td className="py-2 pl-4 text-right">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/org/${orgSlug}/pedidos/${child.id}`}>
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function DispatchRemittanceCard({
  currentOrderEvent,
  downloadingEvent,
  generatingEvent,
  onDownload,
  onGenerate,
}: {
  currentOrderEvent: OrderDispatchEventSummary;
  downloadingEvent: string | null;
  generatingEvent: string | null;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (childOrderId: string, remitoNumber: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TruckIcon className="h-5 w-5" />
          Remito de despacho
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">
                Remito N&deg; {currentOrderEvent.remito_number}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatDate(currentOrderEvent.dispatched_at)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {currentOrderEvent.remittance_pdf_url ? (
              <>
                <RemittancePreviewButton
                  pdfUrl={currentOrderEvent.remittance_pdf_url}
                />
                <Button
                  disabled={
                    downloadingEvent ===
                    `${currentOrderEvent.child_order_id}-${currentOrderEvent.remito_number}`
                  }
                  onClick={() =>
                    onDownload(
                      currentOrderEvent.child_order_id,
                      currentOrderEvent.remito_number
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {downloadingEvent ===
                  `${currentOrderEvent.child_order_id}-${currentOrderEvent.remito_number}` ? (
                    <>
                      <Spinner className="mr-2 size-4" />
                      Descargando...
                    </>
                  ) : (
                    <>
                      <FileTextIcon className="mr-2 h-4 w-4" />
                      Descargar
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                disabled={
                  generatingEvent ===
                  `${currentOrderEvent.child_order_id}-${currentOrderEvent.remito_number}`
                }
                onClick={() =>
                  onGenerate(
                    currentOrderEvent.child_order_id,
                    currentOrderEvent.remito_number
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {generatingEvent ===
                `${currentOrderEvent.child_order_id}-${currentOrderEvent.remito_number}` ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileTextIcon className="mr-2 h-4 w-4" />
                    Generar Remito
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChildrenSection({
  childOrders,
  childrenExpanded,
  onToggle,
  orgSlug,
  dispatchEventsByChild,
  onDownload,
  onGenerate,
  downloadingEvent,
  generatingEvent,
}: {
  childOrders: OrderWithChildren["children"];
  childrenExpanded: boolean;
  onToggle: () => void;
  orgSlug: string;
  dispatchEventsByChild: Map<string, OrderDispatchEventSummary>;
  onDownload: (childOrderId: string, remitoNumber: string) => void;
  onGenerate: (childOrderId: string, remitoNumber: string) => void;
  downloadingEvent: string | null;
  generatingEvent: string | null;
}) {
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <CardTitle className="flex items-center gap-2 text-base">
          <button className="flex items-center gap-2" type="button">
            {childrenExpanded ? (
              <CaretDownIcon className="h-4 w-4" />
            ) : (
              <CaretRightIcon className="h-4 w-4" />
            )}
            Sub-Pedidos ({childOrders.length})
          </button>
        </CardTitle>
      </CardHeader>
      {childrenExpanded && (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pr-4 pb-2 text-left font-medium">N° Pedido</th>
                  <th className="px-4 pb-2 text-left font-medium">Ruta</th>
                  <th className="px-4 pb-2 text-left font-medium">Estado</th>
                  <th className="px-4 pb-2 text-left font-medium">
                    Observaciones
                  </th>
                  <th className="px-4 pb-2 text-left font-medium">Remito</th>
                  <th className="pb-2 pl-4 text-right font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {childOrders.map((child) => {
                  const ev = dispatchEventsByChild.get(child.id);
                  return (
                    <ChildOrderRow
                      child={child}
                      ev={ev}
                      isDownloading={
                        ev !== undefined &&
                        downloadingEvent === `${child.id}-${ev.remito_number}`
                      }
                      isGenerating={
                        ev !== undefined &&
                        generatingEvent === `${child.id}-${ev.remito_number}`
                      }
                      key={child.id}
                      onDownload={onDownload}
                      onGenerate={onGenerate}
                      orgSlug={orgSlug}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ItemsSection({
  quote,
  childOrders,
  childById,
}: {
  quote: NonNullable<OrderWithChildren["quotes"]>;
  childOrders: OrderWithChildren["children"];
  childById: Map<string, OrderWithChildren["children"][number]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Items del pedido</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pr-4 pb-2 text-left font-medium">Descripción</th>
                <th className="px-4 pb-2 text-right font-medium">Cant.</th>
                <th className="px-4 pb-2 text-right font-medium">
                  P. Unitario
                </th>
                <th className="px-4 pb-2 text-right font-medium">Subtotal</th>
                {childOrders.length > 0 && (
                  <>
                    <th className="px-4 pb-2 text-left font-medium">Ruta</th>
                    <th className="pb-2 pl-4 text-left font-medium">Estado</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {quote.quote_items.map((item) => {
                const child = item.assigned_order_id
                  ? childById.get(item.assigned_order_id)
                  : undefined;
                const itemRoute = child ? child.order_number : null;
                const extrasTotal = truncateMoney(
                  (item.quote_item_extras ?? []).reduce(
                    (sum, extra) => sum + extra.price,
                    0
                  )
                );
                const displaySubtotal = truncateMoney(
                  (item.subtotal ?? 0) + extrasTotal * item.quantity
                );
                return (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="py-2 pr-4">
                      <div>{item.description}</div>
                      <ItemExtrasList
                        currency={quote.currency}
                        extras={item.quote_item_extras}
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCurrency(item.unit_price, quote.currency)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(displaySubtotal, quote.currency)}
                    </td>
                    {childOrders.length > 0 && (
                      <>
                        <td className="px-4 py-2 text-left">
                          {itemRoute
                            ? ROUTE_LABEL[
                                itemRoute.split("-").at(-2) as ChildOrderRoute
                              ]
                            : "—"}
                        </td>
                        <td className="py-2 pl-4 text-left">
                          {child ? (
                            <OrderStatusBadge status={child.status} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderDetailHeader({
  cancelCheck,
  customerName,
  onCancelClick,
  order,
  orgSlug,
}: {
  cancelCheck: {
    type: "single" | "child" | "parent";
    childCount?: number;
  } | null;
  customerName: string;
  onCancelClick: () => void;
  order: OrderWithChildren;
  orgSlug: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          asChild
          className="inline-flex items-center gap-1"
          variant="ghost"
        >
          <Link href={`/org/${orgSlug}/pedidos`}>
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a Pedidos
          </Link>
        </Button>
        {order.parent_order_id && (
          <Button
            asChild
            className="inline-flex items-center gap-1"
            variant="ghost"
          >
            <Link href={`/org/${orgSlug}/pedidos/${order.parent_order_id}`}>
              <ArrowLeftIcon className="h-4 w-4" />
              Ir a pedido padre
            </Link>
          </Button>
        )}
        {order.sales_order_id && (
          <Button
            asChild
            className="inline-flex items-center gap-1"
            variant="ghost"
          >
            <Link href={`/org/${orgSlug}/ventas/${order.sales_order_id}`}>
              <ReceiptIcon className="h-4 w-4" />
              {order.sales_order?.sale_number
                ? `Ver venta #${order.sales_order.sale_number}`
                : "Ver venta relacionada"}
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl">{order.order_number}</h1>
          <OrderStatusBadge status={order.status} />
          {cancelCheck && (
            <Button onClick={onCancelClick} size="sm" variant="destructive">
              <XCircleIcon className="mr-1.5 size-4" />
              Cancelar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <UserIcon className="h-4 w-4" />
            {customerName}
          </span>
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-4 w-4" />
            {formatDate(order.created_at ?? "")}
          </span>
        </div>
      </div>
    </div>
  );
}

const NON_CANCELLABLE_STATUSES: OrderFlowStatus[] = [
  "DELIVERED",
  "CANCELLED",
  "FINANCE_REJECTED",
  "DISPATCHED",
];

async function downloadRemitta(
  orgSlug: string,
  childOrderId: string,
  remitoNumber: string,
  setKey: (key: string | null) => void
) {
  const key = `${childOrderId}-${remitoNumber}`;
  setKey(key);
  try {
    const result = await downloadOrderRemittanceAction(
      orgSlug,
      childOrderId,
      remitoNumber
    );
    if (!result.success) {
      throw new Error(result.error ?? "Error al descargar el remito");
    }
    const binary = window.atob(result.pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Remito descargado correctamente");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Error al descargar el remito";
    toast.error(errorMessage);
  } finally {
    setKey(null);
  }
}

async function generateRemitta({
  orgSlug,
  childOrderId,
  remitoNumber,
  setKey,
  onSuccess,
}: {
  orgSlug: string;
  childOrderId: string;
  remitoNumber: string;
  setKey: (key: string | null) => void;
  onSuccess?: (pdfUrl: string) => void;
}) {
  const key = `${childOrderId}-${remitoNumber}`;
  setKey(key);
  try {
    const result = await generateOrderRemittanceAction(
      orgSlug,
      childOrderId,
      remitoNumber
    );
    if (result.success) {
      toast.success("Remito generado correctamente");
      if (result.pdfUrl) {
        onSuccess?.(result.pdfUrl);
      }
    } else {
      throw new Error(result.error ?? "Error al generar el remito");
    }
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Error al generar el remito"
    );
  } finally {
    setKey(null);
  }
}

function getDispatchOrderIds(
  children: OrderWithChildren["children"],
  order: OrderWithChildren
): string[] {
  if (children.length > 0) {
    return children.map((c) => c.id);
  }
  if (order.status === "DISPATCHED" || order.status === "DELIVERED") {
    return [order.id];
  }
  return [];
}

function buildEventMap(
  events: OrderDispatchEventSummary[]
): Map<string, OrderDispatchEventSummary> {
  const map = new Map<string, OrderDispatchEventSummary>();
  for (const ev of events) {
    map.set(ev.child_order_id, ev);
  }
  return map;
}

function mergeLocalPdfUrls(
  base: Map<string, OrderDispatchEventSummary>,
  localUrls: Map<string, string>
): Map<string, OrderDispatchEventSummary> {
  const merged = new Map(base);
  for (const [childOrderId, pdfUrl] of localUrls) {
    const existing = merged.get(childOrderId);
    if (existing) {
      merged.set(childOrderId, { ...existing, remittance_pdf_url: pdfUrl });
    }
  }
  return merged;
}

function getCancelCheck(
  order: OrderWithChildren,
  children: OrderWithChildren["children"]
): { type: "single" | "child" | "parent"; childCount?: number } | null {
  if (NON_CANCELLABLE_STATUSES.includes(order.status)) {
    return null;
  }
  if (order.parent_order_id) {
    return { type: "child" };
  }
  if (children.length > 0) {
    return { type: "parent", childCount: children.length };
  }
  return { type: "single" };
}

export function OrderDetailClient({ orgSlug, order }: OrderDetailClientProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [downloadingEvent, setDownloadingEvent] = useState<string | null>(null);
  const [generatingEvent, setGeneratingEvent] = useState<string | null>(null);
  const [localPdfUrls, setLocalPdfUrls] = useState<Map<string, string>>(
    new Map()
  );
  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const history = order.order_status_history ?? [];
  const designs = order.order_designs;
  const children = order.children ?? [];

  const childById = new Map(children.map((c) => [c.id, c]));

  const dispatchEventOrderIds = getDispatchOrderIds(children, order);

  const { data: dispatchEvents = [] } = useOrderDispatchEvents(
    orgSlug,
    dispatchEventOrderIds
  );

  const dispatchEventsByChild = buildEventMap(dispatchEvents);

  const effectiveDispatchEventsByChild = mergeLocalPdfUrls(
    dispatchEventsByChild,
    localPdfUrls
  );

  const currentOrderEvent = effectiveDispatchEventsByChild.get(order.id);

  const cancelCheck = getCancelCheck(order, children);

  return (
    <div className="space-y-6">
      <OrderDetailHeader
        cancelCheck={cancelCheck}
        customerName={customerName}
        onCancelClick={() => setCancelModalOpen(true)}
        order={order}
        orgSlug={orgSlug}
      />

      <OrderFlowTimeline currentStatus={order.status} history={history} />

      {currentOrderEvent && (
        <DispatchRemittanceCard
          currentOrderEvent={currentOrderEvent}
          downloadingEvent={downloadingEvent}
          generatingEvent={generatingEvent}
          onDownload={(id, rem) =>
            downloadRemitta(orgSlug, id, rem, setDownloadingEvent)
          }
          onGenerate={(id, rem) =>
            generateRemitta({
              orgSlug,
              childOrderId: id,
              remitoNumber: rem,
              setKey: setGeneratingEvent,
              onSuccess: (pdfUrl) => {
                setLocalPdfUrls((prev) => {
                  const next = new Map(prev);
                  next.set(id, pdfUrl);
                  return next;
                });
              },
            })
          }
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del presupuesto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">{customerName}</span>
            </div>
            {quote && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Moneda</span>
                  <span className="font-medium">{quote.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Condición de pago
                  </span>
                  <span className="font-medium">
                    {quote.payment_condition ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto total</span>
                  <span className="font-medium">
                    {formatCurrency(quote.total_amount, quote.currency)}
                  </span>
                </div>
                {quote.observations && (
                  <div className="border-t pt-3">
                    <p className="text-muted-foreground text-xs">
                      Observaciones del presupuesto
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">
                      {quote.observations}
                    </p>
                  </div>
                )}
                {order.purchase_order_file && (
                  <div className="border-t pt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={order.purchase_order_file} target="_blank">
                        <FilePdfIcon className="mr-1.5 h-4 w-4 text-destructive" />
                        Ver orden de compra
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {designs && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Boceto</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={`/org/${orgSlug}/produccion/${order.id}/boceto`}>
                  <FileTextIcon className="mr-2 h-4 w-4" />
                  Ver boceto
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {children.length > 0 && (
        <ChildrenSection
          childOrders={children}
          childrenExpanded={childrenExpanded}
          dispatchEventsByChild={effectiveDispatchEventsByChild}
          downloadingEvent={downloadingEvent}
          generatingEvent={generatingEvent}
          onDownload={(id, rem) =>
            downloadRemitta(orgSlug, id, rem, setDownloadingEvent)
          }
          onGenerate={(id, rem) =>
            generateRemitta({
              orgSlug,
              childOrderId: id,
              remitoNumber: rem,
              setKey: setGeneratingEvent,
              onSuccess: (pdfUrl) => {
                setLocalPdfUrls((prev) => {
                  const next = new Map(prev);
                  next.set(id, pdfUrl);
                  return next;
                });
              },
            })
          }
          onToggle={() => setChildrenExpanded(!childrenExpanded)}
          orgSlug={orgSlug}
        />
      )}

      {order.observations && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Observaciones del pedido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{order.observations}</p>
          </CardContent>
        </Card>
      )}

      {quote && quote.quote_items.length > 0 && (
        <ItemsSection
          childById={childById}
          childOrders={children}
          quote={quote}
        />
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de estados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pr-4 pb-2 text-left font-medium">Fecha</th>
                    <th className="px-4 pb-2 text-left font-medium">
                      Estado anterior
                    </th>
                    <th className="px-4 pb-2 text-left font-medium">
                      Estado nuevo
                    </th>
                    <th className="px-4 pb-2 text-left font-medium">Usuario</th>
                    <th className="pb-2 pl-4 text-left font-medium">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <HistoryRow entry={entry} key={entry.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {cancelCheck && (
        <CancelOrderModal
          childCount={cancelCheck.childCount}
          onOpenChange={setCancelModalOpen}
          open={cancelModalOpen}
          orderId={order.id}
          orderNumber={order.order_number ?? order.id}
          orderStatus={order.status}
          orgSlug={orgSlug}
          type={cancelCheck.type}
        />
      )}
    </div>
  );
}

function HistoryRow({
  entry,
}: {
  entry: OrderWithChildren["order_status_history"][number];
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const notes = entry.notes;
  const maxLen = 80;
  const isLong = (notes?.length ?? 0) > maxLen;

  return (
    <tr className="border-b last:border-0" key={entry.id}>
      <td className="whitespace-nowrap py-2 pr-4">
        {formatDate(entry.changed_at ?? "")}
      </td>
      <td className="px-4 py-2">
        <StatusLabel status={entry.from_status} />
      </td>
      <td className="px-4 py-2">
        <StatusLabel status={entry.to_status} />
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
        {entry.changed_by_name ?? "—"}
      </td>
      <td className="py-2 pl-4 text-muted-foreground">
        {notes ? (
          <span>
            {isLong ? `${notes.slice(0, maxLen)}...` : notes}
            {isLong && (
              <Button
                className="ml-1 h-auto p-0 font-medium text-xs"
                onClick={() => setNotesOpen(true)}
                variant="link"
              >
                Ver más
              </Button>
            )}
          </span>
        ) : (
          "—"
        )}
      </td>
      {isLong && (
        <Dialog onOpenChange={setNotesOpen} open={notesOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-base">Observación</DialogTitle>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-muted-foreground text-sm">
              {notes}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </tr>
  );
}

function StatusLabel({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <OrderStatusBadge status={status as OrderFlowStatus} />;
}
