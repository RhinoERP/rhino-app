"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { FinancialBreakdownResponse } from "@/types/dashboard";

type FinancialBreakdownChartProps = {
  breakdown: FinancialBreakdownResponse;
};

type TooltipPayload = {
  name: string;
  value: number;
  color: string;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!(active && payload?.length)) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-2 font-semibold text-sm">{label}</p>
      <div className="space-y-1.5 text-xs">
        {payload.map((item) => (
          <div
            className="flex items-center justify-between gap-4"
            key={item.name}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-semibold">{formatCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialBreakdownChart({
  breakdown,
}: FinancialBreakdownChartProps) {
  const data = [
    {
      name: "Facturación",
      Distribuidora: breakdown.invoicing.normalSales,
      "Venta directa": breakdown.invoicing.directSales,
    },
    {
      name: "Efectivo",
      Distribuidora: breakdown.cashCollections.receivableCash,
      "Venta directa": breakdown.cashCollections.directSalesCash,
    },
  ];

  const hasData = data.some(
    (item) => item.Distribuidora > 0 || item["Venta directa"] > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desglose Financiero</CardTitle>
        <CardDescription>
          Comparación entre distribuidora y venta directa
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer height={320} width="100%">
            <BarChart data={data} margin={{ top: 10, right: 20, bottom: 0 }}>
              <CartesianGrid
                className="stroke-muted"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                className="text-xs"
                dataKey="name"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => {
                  if (Math.abs(Number(value)) >= 1_000_000) {
                    return `$${(Number(value) / 1_000_000).toFixed(1)}M`;
                  }
                  if (Math.abs(Number(value)) >= 1000) {
                    return `$${(Number(value) / 1000).toFixed(0)}K`;
                  }
                  return `$${value}`;
                }}
                width={80}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Bar
                dataKey="Distribuidora"
                fill="hsl(142, 76%, 36%)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="Venta directa"
                fill="hsl(221, 83%, 53%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[320px] items-center justify-center text-center">
            <p className="text-muted-foreground text-sm">
              No hay movimientos financieros para el periodo seleccionado
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
