import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderFlowTimeline } from "@/components/orders/order-flow-timeline";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { getOrderDetailAction } from "@/modules/orders/actions/get-order-detail.action";
import { ORDER_STATUS_CONFIG } from "@/modules/orders/types";

type OrderDetailPageProps = {
  params: Promise<{ orgSlug: string; orderId: string }>;
};

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { orgSlug, orderId } = await params;

  const order = await getOrderDetailAction(orgSlug, orderId);
  if (!order) {
    notFound();
  }

  const customer = order.quotes?.customers;
  const quote = order.quotes;
  const _config = ORDER_STATUS_CONFIG[order.status];

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      {/* Back + Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button asChild size="icon" variant="ghost">
            <Link href={`/org/${orgSlug}/pedidos`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-bold text-2xl">{order.order_number}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {customer?.fantasy_name || customer?.business_name || "Cliente"} ·{" "}
              Creado el {formatDate(order.created_at ?? "")}
            </p>
          </div>
        </div>
      </div>

      {/* Timeline del flujo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flujo del Pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderFlowTimeline
            currentStatus={order.status}
            history={order.order_status_history ?? []}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Detalle del presupuesto */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalle del Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Cliente</p>
                <p className="mt-0.5 font-medium">
                  {customer?.fantasy_name || customer?.business_name || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Monto total</p>
                <p className="mt-0.5 font-medium">
                  {quote
                    ? formatCurrency(quote.total_amount, quote.currency)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  Condición de pago
                </p>
                <p className="mt-0.5 font-medium">
                  {quote?.payment_condition || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Moneda</p>
                <p className="mt-0.5 font-medium">{quote?.currency || "—"}</p>
              </div>
            </div>

            {/* Productos */}
            {quote?.quote_items && quote.quote_items.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Productos
                </p>
                <div className="space-y-2">
                  {quote.quote_items.map((item) => (
                    <div
                      className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                      key={item.id}
                    >
                      <span>{item.description || "Producto"}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>x{item.quantity}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(item.subtotal, quote.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historial de estados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de Cambios</CardTitle>
          </CardHeader>
          <CardContent>
            {order.order_status_history?.length > 0 ? (
              <div className="space-y-3">
                {[...order.order_status_history].reverse().map((entry) => {
                  const toConfig = ORDER_STATUS_CONFIG[entry.to_status];
                  return (
                    <div
                      className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0"
                      key={entry.id}
                    >
                      <div
                        className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${toConfig.bgColor} border ${toConfig.borderColor}`}
                      />
                      <div className="flex-1 text-sm">
                        <p className={`font-medium ${toConfig.color}`}>
                          {toConfig.label}
                        </p>
                        {entry.notes && (
                          <p className="mt-0.5 text-muted-foreground text-xs">
                            {entry.notes}
                          </p>
                        )}
                        <p className="mt-1 text-muted-foreground/60 text-xs">
                          {formatDate(entry.changed_at ?? "")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Sin cambios registrados.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diseño (si existe) */}
      {order.order_designs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Boceto de Producción</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {(order.order_designs.products as unknown[])?.length ?? 0}{" "}
                producto(s) en el boceto
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/org/${orgSlug}/produccion/${orderId}/boceto`}>
                  Ver boceto
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
