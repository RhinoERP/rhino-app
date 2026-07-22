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

const BUENOS_AIRES_TIMEZONE = "America/Argentina/Buenos_Aires";
const COUNTED_STATUSES: SalesOrderWithCustomer["status"][] = [
  "CONFIRMED",
  "DISPATCH",
  "DELIVERED",
];

function getCurrentMonthRangeBuenosAires(): {
  startDate: string;
  endDate: string;
} | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUENOS_AIRES_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!(Number.isFinite(year) && Number.isFinite(month))) {
    return null;
  }

  const monthStr = String(month).padStart(2, "0");
  const startDate = `${year}-${monthStr}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${monthStr}-${String(endDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

export function SalesMetrics({ sales }: SalesMetricsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusClick = (status: SalesOrderWithCustomer["status"]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("estado", status);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const currentMonthSales = useMemo(() => {
    const range = getCurrentMonthRangeBuenosAires();

    if (!range) {
      return [];
    }

    const { startDate, endDate } = range;

    return sales.filter((sale) => {
      if (!sale.sale_date) {
        return false;
      }
      const saleDate = sale.sale_date.split("T")[0];
      return saleDate >= startDate && saleDate <= endDate;
    });
  }, [sales]);

  const metrics = useMemo(() => {
    const countedSales = currentMonthSales.filter((sale) =>
      COUNTED_STATUSES.includes(sale.status)
    );
    const total = countedSales.length;
    const totalAmount = countedSales.reduce(
      (sum, sale) => sum + (sale.total_amount ?? 0),
      0
    );
    const preSales = currentMonthSales.filter(
      (sale) => sale.status === "DRAFT"
    ).length;
    const delivered = currentMonthSales.filter(
      (sale) => sale.status === "DELIVERED"
    ).length;

    return {
      total,
      totalAmount,
      preSales,
      delivered,
    };
  }, [currentMonthSales]);

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
          <div className="font-bold text-2xl">{metrics.total}</div>
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
            {formatCurrency(metrics.totalAmount)}
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
