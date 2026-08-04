"use client";

import {
  BarcodeIcon,
  CurrencyDollarSimpleIcon,
  DropIcon,
  PackageIcon,
  ScalesIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { StockMetrics } from "@/modules/inventory/types";

type StockMetricsProps = {
  metrics: StockMetrics;
};

function formatWeight(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

export function StockMetricsCards({ metrics }: StockMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <PackageIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Productos activos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-xl">{metrics.activeProducts}</div>
          <p className="text-muted-foreground text-xs">
            Productos con stock activo
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <BarcodeIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total unidades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="truncate font-bold text-xl">
            {metrics.totalUnits.toLocaleString()}
          </div>
          <p className="text-muted-foreground text-xs">Unidades en stock</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ScalesIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total KG</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-xl">
            {formatWeight(metrics.totalKg)}
          </div>
          <p className="text-muted-foreground text-xs">Kilogramos en stock</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <DropIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Total LT</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-xl">
            {formatWeight(metrics.totalLt)}
          </div>
          <p className="text-muted-foreground text-xs">Litros en stock</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CurrencyDollarSimpleIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Valor del stock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="truncate font-bold text-xl">
            {formatCurrency(metrics.totalStockValue)}
          </div>
          <p className="text-muted-foreground text-xs">
            Valor total del inventario (costo)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
