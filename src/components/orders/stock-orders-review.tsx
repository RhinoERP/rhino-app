"use client";

import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Package,
  ShoppingCart,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import type { StockInfo } from "@/modules/orders/actions/get-stock-for-order.action";
import { updateOrderStatusAction } from "@/modules/orders/actions/update-order-status.action";
import type { OrderFlowStatus, OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type StockOrdersReviewProps = {
  orders: OrderWithDetails[];
  orgSlug: string;
};

export function StockOrdersReview({ orders, orgSlug }: StockOrdersReviewProps) {
  const router = useRouter();

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">
          Sin pedidos en esta etapa
        </p>
        <p className="mt-1 text-muted-foreground/60 text-sm">
          Cuando Finanzas apruebe un pedido aparecerá acá para verificar stock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <StockOrderCard
          key={order.id}
          onActionComplete={() => router.refresh()}
          order={order}
          orgSlug={orgSlug}
        />
      ))}
    </div>
  );
}

function StockOrderCard({
  order,
  orgSlug,
  onActionComplete,
}: {
  order: OrderWithDetails;
  orgSlug: string;
  onActionComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [stockInfo, setStockInfo] = useState<StockInfo[]>([]);
  const customer = order.quotes?.customers;
  const quote = order.quotes;

  // Cargar stock real al expandir
  useEffect(() => {
    if (!(expanded && quote?.quote_items?.length)) {
      return;
    }
    const productIds = quote.quote_items
      .filter((i) => i.product_id)
      .map((i) => i.product_id as string);
    if (!productIds.length) {
      return;
    }

    const quantitiesNeeded: Record<string, number> = {};
    for (const item of quote.quote_items) {
      if (item.product_id) {
        quantitiesNeeded[item.product_id] =
          (quantitiesNeeded[item.product_id] ?? 0) + item.quantity;
      }
    }

    import("@/modules/orders/actions/get-stock-for-order.action").then(
      ({ getStockForOrderAction }) => {
        getStockForOrderAction(productIds, quantitiesNeeded).then(setStockInfo);
      }
    );
  }, [expanded, quote?.quote_items]);

  const handleAction = (newStatus: OrderFlowStatus, description: string) => {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orgSlug,
        orderId: order.id,
        newStatus,
        notes: notes || description,
        extraFields:
          newStatus === "STOCK_OK" || newStatus === "PURCHASE_REQUIRED"
            ? { stock_checked_at: new Date().toISOString() }
            : {},
      });

      if (result.success) {
        toast.success(`Pedido ${order.order_number}: ${description}`);
        onActionComplete();
      } else {
        toast.error(result.error ?? "Error al actualizar el pedido");
      }
    });
  };

  const isPendingStock = order.status === "PENDING_STOCK";
  const isPurchaseRequired = order.status === "PURCHASE_REQUIRED";
  const isPurchasing = order.status === "PURCHASING";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold">
              {order.order_number}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>
          <Button
            onClick={() => setExpanded(!expanded)}
            size="sm"
            variant="ghost"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            {customer?.fantasy_name || customer?.business_name || "—"}
          </span>
          {quote && (
            <span className="font-medium">
              {formatCurrency(quote.total_amount, quote.currency)}
            </span>
          )}
          <span className="text-muted-foreground">
            {formatDate(order.created_at ?? "")}
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 border-t pt-4">
          {/* Productos con stock real */}
          {quote?.quote_items && quote.quote_items.length > 0 && (
            <div>
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Productos a verificar
              </p>
              <div className="space-y-1.5">
                {quote.quote_items.map((item) => {
                  const stock = stockInfo.find(
                    (s) => s.product_id === item.product_id
                  );
                  return (
                    <div
                      className="flex items-center justify-between rounded bg-muted/40 px-3 py-2 text-sm"
                      key={item.id}
                    >
                      <span>{item.description || "Producto"}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          Necesario: x{item.quantity}
                        </span>
                        {stock && (
                          <span
                            className={`font-semibold text-xs ${
                              stock.has_stock
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            Stock: {stock.stock_available}
                            {stock.has_stock ? " ✓" : " ✗"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {stockInfo.length > 0 && (
                <p
                  className={`mt-2 font-medium text-xs ${
                    stockInfo.every((s) => s.has_stock)
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-orange-600 dark:text-orange-400"
                  }`}
                >
                  {stockInfo.every((s) => s.has_stock)
                    ? "✓ Stock suficiente para todos los productos"
                    : "⚠ Stock insuficiente en algunos productos"}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre el stock verificado..."
              rows={2}
              value={notes}
            />
          </div>

          {/* Acciones según estado */}
          {isPendingStock && (
            <div className="flex gap-3">
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={() =>
                  handleAction("STOCK_OK", "Stock disponible — reservado")
                }
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Stock disponible
              </Button>
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={() =>
                  handleAction(
                    "PURCHASE_REQUIRED",
                    "Stock insuficiente — requiere compra"
                  )
                }
                variant="outline"
              >
                <AlertTriangle className="mr-2 h-4 w-4 text-orange-500" />
                Requiere compra
              </Button>
            </div>
          )}

          {isPurchaseRequired && (
            <div className="space-y-3">
              <div className="rounded-md bg-orange-500/10 px-3 py-2 text-orange-600 text-sm dark:text-orange-400">
                Generá una orden de compra desde el módulo de Compras y luego
                confirmá acá.
              </div>
              <Button
                className="w-full"
                disabled={isPending}
                onClick={() =>
                  handleAction(
                    "PURCHASING",
                    "Orden de compra generada con proveedor"
                  )
                }
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Confirmar orden de compra generada
              </Button>
            </div>
          )}

          {isPurchasing && (
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() =>
                handleAction(
                  "GOODS_RECEIVED",
                  "Mercadería recibida en depósito"
                )
              }
            >
              <Package className="mr-2 h-4 w-4" />
              Confirmar recepción de mercadería
            </Button>
          )}

          {["STOCK_OK", "GOODS_RECEIVED"].includes(order.status) && (
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() =>
                handleAction("IN_PRODUCTION", "Pasa a producción y diseño")
              }
            >
              Enviar a Producción
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
