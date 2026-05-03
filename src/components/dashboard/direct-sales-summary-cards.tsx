"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  CurrencyDollarSimpleIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { DirectSalesDashboardResponse } from "@/types/dashboard";

type DirectSalesSummaryCardsProps = {
  summary: DirectSalesDashboardResponse["summary"];
};

export function DirectSalesSummaryCards({
  summary,
}: DirectSalesSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        description="Operaciones POS del periodo"
        icon={ShoppingBagIcon}
        title="Ventas del mes"
        value={String(summary.currentMonthSalesCount)}
      />
      <MetricCard
        description="Importe total vendido"
        icon={CurrencyDollarSimpleIcon}
        title="Total vendido"
        value={formatCurrency(summary.currentMonthTotalAmount)}
      />
      <MetricCard
        description="Promedio por operación"
        icon={ReceiptIcon}
        title="Ticket promedio"
        value={formatCurrency(summary.currentMonthAverageTicket)}
      />
      <MetricCard
        description="Total cobrado en efectivo"
        icon={WalletIcon}
        title="Cobros en efectivo"
        value={formatCurrency(summary.currentMonthCashAmount)}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: IconComponent,
}: {
  title: string;
  value: string;
  description: string;
  icon: Icon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border">
          <IconComponent
            className="h-4 w-4 text-muted-foreground"
            weight="duotone"
          />
        </div>
        <CardTitle className="font-medium text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">{value}</div>
        <p className="text-muted-foreground text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}
