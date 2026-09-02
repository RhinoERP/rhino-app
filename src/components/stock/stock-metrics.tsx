"use client";

import {
  BarcodeIcon,
  CurrencyDollarSimpleIcon,
  DropIcon,
  PackageIcon,
  ScalesIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { StockMetrics } from "@/modules/inventory/types";

type StockMetricsProps = {
  metrics: StockMetrics;
};

function formatWeight(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

async function fetchUsdRate(): Promise<number> {
  const res = await fetch("/api/exchange-rate/usd");
  if (!res.ok) {
    throw new Error("Error al obtener la cotización");
  }
  const data = (await res.json()) as { venta: number };
  return data.venta;
}

export function StockMetricsCards({ metrics }: StockMetricsProps) {
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const { can } = usePermissions();
  const canManageInventory = can("inventory.manage");

  useEffect(() => {
    fetchUsdRate()
      .then(setUsdRate)
      .catch(() => setUsdRate(null));
  }, []);

  return (
    <div className="flex flex-wrap gap-4">
      {metrics.activeProducts > 0 && (
        <Card className="min-w-60 flex-1">
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
      )}

      {metrics.totalUnits > 0 && (
        <Card className="min-w-60 flex-1">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <BarcodeIcon
                className="h-4 w-4 text-muted-foreground"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">
              Total unidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="truncate font-bold text-xl">
              {metrics.totalUnits.toLocaleString()}
            </div>
            <p className="text-muted-foreground text-xs">Unidades en stock</p>
          </CardContent>
        </Card>
      )}

      {metrics.totalKg > 0 && (
        <Card className="min-w-60 flex-1">
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
      )}

      {metrics.totalLt > 0 && (
        <Card className="min-w-60 flex-1">
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
      )}

      {metrics.totalStockValue > 0 && canManageInventory && (
        <>
          <Card className="min-w-60 flex-1">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border">
                <CurrencyDollarSimpleIcon
                  className="h-4 w-4 text-muted-foreground"
                  weight="duotone"
                />
              </div>
              <CardTitle className="font-medium text-sm">
                Valor del stock (costo pesos)
              </CardTitle>
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

          <Card className="min-w-60 flex-1">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border">
                <CurrencyDollarSimpleIcon
                  className="h-4 w-4 text-muted-foreground"
                  weight="duotone"
                />
              </div>
              <CardTitle className="font-medium text-sm">
                Valor del stock (costo dolar)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="truncate font-bold text-xl">
                {usdRate
                  ? formatCurrency(metrics.totalStockValue / usdRate, "USD")
                  : "—"}
              </div>
              <p className="text-muted-foreground text-xs">
                {usdRate
                  ? `Dólar BNA: ${formatCurrency(usdRate)}`
                  : "Cotización no disponible"}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
