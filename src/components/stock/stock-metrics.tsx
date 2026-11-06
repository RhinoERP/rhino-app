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
import { valueStock } from "@/modules/inventory/utils/stock-valuation";

type StockMetricsProps = {
  metrics: StockMetrics;
};

function formatWeight(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: visibility combines warehouse scope, cost permissions and native currency availability.
export function StockMetricsCards({ metrics }: StockMetricsProps) {
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [quoteDate, setQuoteDate] = useState<string | null>(null);
  const { can } = usePermissions();
  const canManageInventory = can("inventory.manage");

  useEffect(() => {
    if (!(metrics.canViewCosts && canManageInventory)) {
      return;
    }
    const controller = new AbortController();
    fetch("/api/exchange-rate/usd", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Cotización no disponible");
        }
        const data = await response.json();
        if (!(Number.isFinite(data.venta) && data.venta > 0)) {
          throw new Error("Cotización inválida");
        }
        if (!controller.signal.aborted) {
          setUsdRate(data.venta);
          setQuoteDate(data.fechaActualizacion);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUsdRate(null);
        }
      });
    return () => controller.abort();
  }, [metrics.canViewCosts, canManageInventory]);

  const valuation =
    metrics.canViewCosts && metrics.totalStockValueUsd !== undefined
      ? valueStock(metrics.totalStockValue, metrics.totalStockValueUsd, usdRate)
      : { ars: null, usd: null };

  return (
    <div className="flex flex-wrap gap-4">
      {(metrics.activeProducts > 0 || metrics.warehouseScoped) && (
        <Card className="min-w-60 flex-1">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <PackageIcon
                className="h-4 w-4 text-muted-foreground"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">
              {metrics.warehouseScoped
                ? "Productos activos con stock"
                : "Productos activos"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-xl">{metrics.activeProducts}</div>
            <p className="text-muted-foreground text-xs">
              {metrics.warehouseScoped
                ? "En el depósito seleccionado"
                : "Productos con stock activo"}
            </p>
          </CardContent>
        </Card>
      )}

      {(metrics.totalUnits > 0 || metrics.warehouseScoped) && (
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

      {(metrics.totalKg > 0 || metrics.warehouseScoped) && (
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

      {(metrics.totalLt > 0 || metrics.warehouseScoped) && (
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

      {metrics.canViewCosts &&
        (metrics.totalStockValue > 0 ||
          (metrics.totalStockValueUsd ?? 0) > 0 ||
          (metrics.unpricedStockProducts ?? 0) > 0 ||
          metrics.warehouseScoped) &&
        canManageInventory && (
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
                  {valuation.ars === null ? "—" : formatCurrency(valuation.ars)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {metrics.totalStockValueUsd === undefined
                    ? "Desglose por moneda no disponible; requiere actualizar el agregado de stock."
                    : `Costos nativos: ${formatCurrency(metrics.totalStockValue)} + ${formatCurrency(metrics.totalStockValueUsd, "USD")}`}
                  .
                  {(metrics.unpricedStockProducts ?? 0) > 0
                    ? ` Parcial: ${metrics.unpricedStockProducts} productos sin costo/moneda válida.`
                    : ""}
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
                  {valuation.usd !== null
                    ? formatCurrency(valuation.usd, "USD")
                    : "—"}
                </div>
                <p className="text-muted-foreground text-xs">
                  {usdRate
                    ? `Dólar comercial BNA: ${formatCurrency(usdRate)} · ${quoteDate ?? ""}`
                    : "Cotización no disponible"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
    </div>
  );
}
