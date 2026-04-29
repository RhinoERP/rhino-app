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
import type { DirectSalesPaymentMethodBreakdown } from "@/types/dashboard";

type DirectSalesPaymentMethodsChartProps = {
  data: DirectSalesPaymentMethodBreakdown[];
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload?: DirectSalesPaymentMethodBreakdown;
  }>;
}) {
  const item = payload?.[0]?.payload;

  if (!(active && item)) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-1 font-semibold text-sm">{item.label}</p>
      <p className="text-muted-foreground text-xs">
        {item.count} cobros registrados
      </p>
      <p className="mt-2 font-semibold text-sm">
        {formatCurrency(item.amount)}
      </p>
    </div>
  );
}

export function DirectSalesPaymentMethodsChart({
  data,
}: DirectSalesPaymentMethodsChartProps) {
  const hasData = data.some((item) => item.amount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métodos de Pago</CardTitle>
        <CardDescription>
          Distribución de cobros de venta directa
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-[280px] sm:h-[320px]">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                barCategoryGap="32%"
                data={data}
                margin={{ top: 10, right: 20, bottom: 0 }}
              >
                <CartesianGrid
                  className="stroke-muted"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  className="text-xs"
                  dataKey="label"
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
                  dataKey="amount"
                  fill="hsl(221, 83%, 53%)"
                  maxBarSize={60}
                  name="Importe"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[320px] items-center justify-center text-center">
            <p className="text-muted-foreground text-sm">
              No hay cobros de venta directa para el periodo seleccionado
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
