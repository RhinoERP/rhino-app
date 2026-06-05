"use client";

import {
  ArrowElbowDownRightIcon,
  ClipboardTextIcon,
  FadersIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderMetrics } from "@/modules/orders/types";

type OrdersMetricsProps = {
  metrics: OrderMetrics;
};

export function OrdersMetrics({ metrics }: OrdersMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ClipboardTextIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.total}</div>
          <p className="text-muted-foreground text-xs">Pedidos registrados</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <FadersIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">En curso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.inProgress}</div>
          <p className="text-muted-foreground text-xs">
            Pedidos en proceso activo
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ArrowElbowDownRightIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Requieren acción
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.requiresAction}</div>
          <p className="text-muted-foreground text-xs">
            Pendientes de revisión o compra
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <PackageIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Entregados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.delivered}</div>
          <p className="text-muted-foreground text-xs">
            Pedidos entregados al cliente
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
