"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  CurrencyDollarSimpleIcon,
  ShoppingBagIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { SalesMetrics as SalesMetricsType } from "@/modules/sales/types";

type SalesMetricsProps = {
  metrics: SalesMetricsType;
};

export function SalesMetrics({ metrics }: SalesMetricsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusClick = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("estado", status);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ShoppingBagIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Total de ventas del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">{metrics.totalCurrentMonth}</div>
          <p className="text-muted-foreground text-xs">
            Ventas confirmadas, despachadas o entregadas este mes
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
            Total vendido del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {formatCurrency(metrics.totalAmountCurrentMonth)}
          </div>
          <p className="text-muted-foreground text-xs">
            Suma de ventas confirmadas, despachadas o entregadas este mes
          </p>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer"
        onClick={() => handleStatusClick("DRAFT")}
      >
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ClipboardTextIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Preventas del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {metrics.preSalesCurrentMonth}
          </div>
          <p className="text-muted-foreground text-xs">
            Ventas en borrador este mes
          </p>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer"
        onClick={() => handleStatusClick("DELIVERED")}
      >
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CheckCircleIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Entregadas del mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold text-2xl">
            {metrics.deliveredCurrentMonth}
          </div>
          <p className="text-muted-foreground text-xs">
            Ventas marcadas como entregadas este mes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
