"use client";

import {
  CheckCircleIcon,
  CurrencyDollarSimpleIcon,
  PackageIcon,
  ShoppingCartIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";

type PurchasesMetricsProps = {
  purchases: PurchaseOrderWithSupplier[];
};

export function PurchasesMetrics({ purchases }: PurchasesMetricsProps) {
  const metrics = useMemo(() => {
    const total = purchases.length;
    const totalAmount = purchases.reduce(
      (sum, purchase) => sum + purchase.total_amount,
      0
    );
    const ordered = purchases.filter(
      (purchase) => purchase.status === "ORDERED"
    ).length;
    const received = purchases.filter(
      (purchase) => purchase.status === "RECEIVED"
    ).length;

    return {
      total,
      totalAmount,
      ordered,
      received,
    };
  }, [purchases]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">
            Total de compras
          </CardTitle>
          <ShoppingCartIcon
            className="h-4 w-4 text-muted-foreground"
            weight="duotone"
          />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.total}</div>
          <p className="text-muted-foreground text-xs">Compras registradas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">Total gastado</CardTitle>
          <CurrencyDollarSimpleIcon
            className="h-4 w-4 text-muted-foreground"
            weight="duotone"
          />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.totalAmount)}
          </div>
          <p className="text-muted-foreground text-xs">
            Suma de todas las compras
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">Pendientes</CardTitle>
          <PackageIcon
            className="h-4 w-4 text-muted-foreground"
            weight="duotone"
          />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.ordered}</div>
          <p className="text-muted-foreground text-xs">Compras ordenadas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-sm">Recibidas</CardTitle>
          <CheckCircleIcon
            className="h-4 w-4 text-muted-foreground"
            weight="duotone"
          />
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.received}</div>
          <p className="text-muted-foreground text-xs">Compras recibidas</p>
        </CardContent>
      </Card>
    </div>
  );
}
