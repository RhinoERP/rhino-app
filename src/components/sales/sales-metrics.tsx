"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  CurrencyDollarSimpleIcon,
  ShoppingBagIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type SalesMetricsProps = {
  sales: SalesOrderWithCustomer[];
};

export function SalesMetrics({ sales }: SalesMetricsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusClick = (status: SalesOrderWithCustomer["status"]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("estado", status);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const lastMonthSales = useMemo(() => {
    const now = new Date();
    const oneMonthAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate()
    );
    const oneMonthAgoString = oneMonthAgo.toISOString().split("T")[0];

    return sales.filter((sale) => {
      if (!sale.sale_date) {
        return false;
      }
      return sale.sale_date >= oneMonthAgoString;
    });
  }, [sales]);

  const metrics = useMemo(() => {
    const activeSales = lastMonthSales.filter(
      (sale) => sale.status !== "CANCELLED"
    );
    const total = activeSales.length;
    const totalAmount = activeSales.reduce(
      (sum, sale) => sum + (sale.total_amount ?? 0),
      0
    );
    const preSales = lastMonthSales.filter(
      (sale) => sale.status === "DRAFT"
    ).length;
    const delivered = lastMonthSales.filter(
      (sale) => sale.status === "DELIVERED"
    ).length;

    return {
      total,
      totalAmount,
      preSales,
      delivered,
    };
  }, [lastMonthSales]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <div className="font-bold text-2xl">{metrics.total}</div>
          <p className="text-muted-foreground text-xs">
            Ventas registradas este mes
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
            {formatCurrency(metrics.totalAmount)}
          </div>
          <p className="text-muted-foreground text-xs">
            Suma de todas las ventas del mes
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
          <div className="font-bold text-2xl">{metrics.preSales}</div>
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
          <div className="font-bold text-2xl">{metrics.delivered}</div>
          <p className="text-muted-foreground text-xs">
            Ventas marcadas como entregadas este mes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
