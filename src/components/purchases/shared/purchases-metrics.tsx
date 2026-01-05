"use client";

import {
  CheckCircleIcon,
  CurrencyDollarSimpleIcon,
  PackageIcon,
  ShoppingCartIcon,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";

type PurchasesMetricsProps = {
  purchases: PurchaseOrderWithSupplier[];
};

export function PurchasesMetrics({ purchases }: PurchasesMetricsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusClick = (status: "ORDERED" | "RECEIVED") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("estado", status);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const lastMonthPurchases = useMemo(() => {
    const now = new Date();
    const oneMonthAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate()
    );
    const oneMonthAgoString = oneMonthAgo.toISOString().split("T")[0];

    return purchases.filter((purchase) => {
      if (!purchase.purchase_date) {
        return false;
      }
      return purchase.purchase_date >= oneMonthAgoString;
    });
  }, [purchases]);

  const metrics = useMemo(() => {
    const total = lastMonthPurchases.length;
    const totalAmount = lastMonthPurchases
      .filter((purchase) => purchase.status === "RECEIVED")
      .reduce((sum, purchase) => sum + purchase.total_amount, 0);
    const ordered = lastMonthPurchases.filter(
      (purchase) => purchase.status === "ORDERED"
    ).length;
    const received = lastMonthPurchases.filter(
      (purchase) => purchase.status === "RECEIVED"
    ).length;

    return {
      total,
      totalAmount,
      ordered,
      received,
    };
  }, [lastMonthPurchases]);

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
          <div className="font-bold text-2xl">{metrics.total}</div>
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
            {formatCurrency(metrics.totalAmount)}
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
          <div className="font-bold text-2xl">{metrics.ordered}</div>
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
          <div className="font-bold text-2xl">{metrics.received}</div>
          <p className="text-muted-foreground text-xs">
            Compras recibidas este mes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
