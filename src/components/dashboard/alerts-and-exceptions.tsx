"use client";

/**
 * Alerts and Exceptions Section
 * Alertas y situaciones que requieren atención inmediata
 */

import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/modules/dashboard/types";

type AlertsAndExceptionsProps = {
  data: DashboardData;
};

export function AlertsAndExceptions({ data }: AlertsAndExceptionsProps) {
  const alerts = [
    ...(data.criticalStockProducts.length > 0
      ? [
          {
            type: "stock" as const,
            title: "Stock",
            description: `${data.criticalStockProducts[0]?.name} - Stock crítico (${data.criticalStockProducts[0]?.currentStock} unidades)`,
            badge: "alta",
            badgeVariant: "destructive" as const,
          },
        ]
      : []),
    ...(data.ordersMetrics.delayed > 0
      ? [
          {
            type: "delay" as const,
            title: "Demora",
            description: "Pedido #1246 - Demora en entrega (2 días)",
            badge: "media",
            badgeVariant: "default" as const,
          },
        ]
      : []),
    ...(data.accountsReceivable.overdue > 0
      ? [
          {
            type: "payment" as const,
            title: "Vencimiento",
            description: `Factura F-001243 vence mañana ($${data.accountsReceivable.overdue.toLocaleString()})`,
            badge: "alta",
            badgeVariant: "destructive" as const,
          },
        ]
      : []),
    ...(data.operationalKPIs.customers.inactive > 10
      ? [
          {
            type: "customer" as const,
            title: "Cliente",
            description: `Cliente ${data.topClients[0]?.name || "sin nombre"} sin pedidos hace 15 días`,
            badge: "baja",
            badgeVariant: "secondary" as const,
          },
        ]
      : []),
  ];

  if (alerts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-5 w-5 text-orange-600" />
          <CardTitle>Alertas y Excepciones</CardTitle>
        </div>
        <p className="text-muted-foreground text-sm">
          Situaciones que requieren atención inmediata
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <div
            className="flex items-center justify-between rounded-lg border p-3"
            key={`${alert.type}-${alert.description}`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{alert.title}</p>
                <p className="text-muted-foreground text-sm">
                  {alert.description}
                </p>
              </div>
            </div>
            <Badge variant={alert.badgeVariant}>{alert.badge}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
