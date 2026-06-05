"use client";

import { CheckCircleIcon, PackageIcon, TruckIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DispatchMetrics as DispatchMetricsType } from "@/modules/orders/types";

type DispatchMetricsProps = {
  metrics: DispatchMetricsType;
};

export function DispatchMetrics({ metrics }: DispatchMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <PackageIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Preparando</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.preparing}</div>
          <p className="text-muted-foreground text-xs">
            Pedidos en preparación
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <TruckIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">En camino</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.inTransit}</div>
          <p className="text-muted-foreground text-xs">
            Pedidos despachados en tránsito
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CheckCircleIcon
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
