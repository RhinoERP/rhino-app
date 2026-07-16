"use client";

import {
  CheckCircleIcon,
  CurrencyDollarSimpleIcon,
  PackageIcon,
  ShoppingCartIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { PurchaseMetrics } from "@/modules/purchases/types";

type PurchasesMetricsProps = {
  metrics: PurchaseMetrics;
};

export function PurchasesMetrics({ metrics }: PurchasesMetricsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusClick = (status: "ORDERED" | "RECEIVED") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("estado", status);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ShoppingCartIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Total de compras del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalMonth}</div>
          <p className="text-muted-foreground text-xs">
            Compras registradas este mes
          </p>
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
          <CardTitle className="font-medium text-sm">
            Total gastado del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.totalAmountMonth)}
          </div>
          <p className="text-muted-foreground text-xs">
            Suma de compras recibidas del mes
          </p>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer"
        onClick={() => handleStatusClick("ORDERED")}
      >
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <PackageIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Pendientes del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.orderedMonth}</div>
          <p className="text-muted-foreground text-xs">
            Compras ordenadas este mes
          </p>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer"
        onClick={() => handleStatusClick("RECEIVED")}
      >
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CheckCircleIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Recibidas del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.receivedMonth}</div>
          <p className="text-muted-foreground text-xs">
            Compras recibidas este mes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
