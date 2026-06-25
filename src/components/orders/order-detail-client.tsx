"use client";

import {
  ArrowLeftIcon,
  ArrowRight,
  CalendarIcon,
  CaretDown,
  CaretRight,
  FilePdf,
  FileTextIcon,
  UserIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";

import type {
  ChildOrderRoute,
  OrderFlowStatus,
  OrderWithChildren,
} from "@/modules/orders/types";
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

export function OrderDetailClient({ orgSlug, order }: OrderDetailClientProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(true);
  const quote = order.quotes;
  const customer = quote?.customers;
  const customerName = customer?.fantasy_name ?? customer?.business_name ?? "—";
  const history = order.order_status_history ?? [];
  const designs = order.order_designs;
  const children = order.children ?? [];

  const childById = new Map(children.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl">{order.order_number}</h1>
          <OrderStatusBadge status={order.status} />
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

      <OrderFlowTimeline currentStatus={order.status} history={history} />

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
                {order.purchase_order_file && (
                  <div className="border-t pt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={order.purchase_order_file} target="_blank">
                        <FilePdf className="mr-1.5 h-4 w-4 text-destructive" />
                        Descargar orden de compra
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
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setChildrenExpanded(!childrenExpanded)}
          >
            <CardTitle className="flex items-center gap-2 text-base">
              <button className="flex items-center gap-2" type="button">
                {childrenExpanded ? (
                  <CaretDown className="h-4 w-4" />
                ) : (
                  <CaretRight className="h-4 w-4" />
                )}
                Sub-Pedidos ({children.length})
              </button>
            </CardTitle>
          </CardHeader>
          {childrenExpanded && (
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pr-4 pb-2 text-left font-medium">
                        N° Pedido
                      </th>
                      <th className="px-4 pb-2 text-left font-medium">Ruta</th>
                      <th className="px-4 pb-2 text-left font-medium">
                        Estado
                      </th>
                      <th className="pb-2 pl-4 text-right font-medium">
                        Detalle
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {children.map((child) => (
                      <tr className="border-b last:border-0" key={child.id}>
                        <td className="py-2 pr-4 font-medium">
                          {child.order_number}
                        </td>
                        <td className="px-4 py-2">
                          {child.order_number
                            ? ROUTE_LABEL[
                                child.order_number
                                  .split("-")
                                  .at(-2) as ChildOrderRoute
                              ]
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <OrderStatusBadge status={child.status} />
                        </td>
                        <td className="py-2 pl-4 text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/org/${orgSlug}/pedidos/${child.id}`}>
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {quote && quote.quote_items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items del pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pr-4 pb-2 text-left font-medium">
                      Descripción
                    </th>
                    <th className="px-4 pb-2 text-right font-medium">Cant.</th>
                    <th className="px-4 pb-2 text-right font-medium">
                      P. Unitario
                    </th>
                    <th className="px-4 pb-2 text-right font-medium">
                      Subtotal
                    </th>
                    {children.length > 0 && (
                      <>
                        <th className="px-4 pb-2 text-left font-medium">
                          Ruta
                        </th>
                        <th className="pb-2 pl-4 text-left font-medium">
                          Estado
                        </th>
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
                    return (
                      <tr className="border-b last:border-0" key={item.id}>
                        <td className="py-2 pr-4">
                          <div>{item.description}</div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatCurrency(item.unit_price, quote.currency)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                          {formatCurrency(item.subtotal, quote.currency)}
                        </td>
                        {children.length > 0 && (
                          <>
                            <td className="px-4 py-2 text-left">
                              {itemRoute
                                ? ROUTE_LABEL[
                                    itemRoute
                                      .split("-")
                                      .at(-2) as ChildOrderRoute
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
