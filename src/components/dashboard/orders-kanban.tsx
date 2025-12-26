"use client";

/**
 * Orders Kanban View
 * Vista de estado de pedidos estilo Kanban
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/modules/dashboard/types";

type OrdersKanbanProps = {
  data: DashboardData;
};

export function OrdersKanban({ data }: OrdersKanbanProps) {
  const confirmedOrders = data.orderStatusItems.filter(
    (o) => o.status === "confirmed"
  );

  const columns = [
    {
      title: "Pendientes",
      count: data.ordersMetrics.pending,
      color: "bg-red-100 text-red-700",
      orders: data.orderStatusItems
        .filter((o) => o.status === "pending")
        .slice(0, 3),
    },
    {
      title: "Confirmados",
      count: confirmedOrders.length,
      color: "bg-gray-100 text-gray-700",
      orders: confirmedOrders.slice(0, 3),
    },
    {
      title: "Entregados",
      count: data.ordersMetrics.delivered,
      color: "bg-green-100 text-green-700",
      orders: data.orderStatusItems
        .filter((o) => o.status === "delivered")
        .slice(0, 3),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de Pedidos - Vista Kanban</CardTitle>
        <p className="text-muted-foreground text-sm">
          Flujo operativo de pedidos en tiempo real
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-sm">{column.title}</h3>
                <Badge className={column.color} variant="secondary">
                  {column.count}
                </Badge>
              </div>
              <div className="space-y-2">
                {column.orders.map((order) => (
                  <div className="rounded-lg border bg-card p-3" key={order.id}>
                    <p className="font-medium text-sm">#{order.orderNumber}</p>
                    <p className="text-muted-foreground text-xs">
                      {order.customerName}
                    </p>
                    <p className="mt-1 font-semibold text-sm">
                      ${order.totalAmount.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
