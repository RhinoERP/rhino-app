"use client";

import { TrendUp as TrendUpIcon } from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import type { HistoricalSalesMetric } from "@/modules/sales/historical/types";

type HistoricalSalesTrendChartProps = {
  data: HistoricalSalesMetric[];
  isLoading?: boolean;
  title?: string;
  description?: string;
  showOrders?: boolean;
};

const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

// Custom Tooltip Component
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}) {
  if (!(active && payload) || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-2 font-medium text-sm">{label}</p>
      {payload.map((entry) => (
        <div className="flex items-center gap-2" key={entry.dataKey}>
          <div
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground text-xs">
            {entry.dataKey === "totalAmount" ? "Monto" : "Pedidos"}:
          </span>
          <span className="font-medium text-sm">
            {entry.dataKey === "totalAmount"
              ? formatCurrency(entry.value)
              : entry.value.toLocaleString("es-AR")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HistoricalSalesTrendChart({
  data,
  isLoading = false,
  title = "Tendencia de Ventas Históricas",
  description = "Evolución de ventas importadas desde sistemas legacy",
  showOrders = false,
}: HistoricalSalesTrendChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[350px] items-center justify-center">
          <div className="text-center text-muted-foreground">
            <TrendUpIcon className="mx-auto mb-2 h-12 w-12 opacity-20" />
            <p className="text-sm">No hay datos históricos disponibles</p>
            <p className="mt-1 text-xs">
              Importa datos desde la sección de Importar Datos
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for chart
  const chartData = data.map((item) => {
    const date = new Date(item.period);
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear();

    return {
      period: `${month} ${year}`,
      totalAmount: Number(item.total_amount),
      totalOrders: item.total_orders,
      fullDate: item.period,
    };
  });

  // Calculate total and average
  const totalAmount = data.reduce(
    (sum, item) => sum + Number(item.total_amount),
    0
  );
  const totalOrders = data.reduce((sum, item) => sum + item.total_orders, 0);
  const averageAmount = totalAmount / data.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Total Facturado</p>
            <p className="font-bold text-2xl">
              $
              {totalAmount.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Total Pedidos</p>
            <p className="font-bold text-2xl">
              {totalOrders.toLocaleString("es-AR")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Promedio Mensual</p>
            <p className="font-bold text-2xl">
              $
              {averageAmount.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer height={350} width="100%">
          <AreaChart
            data={chartData}
            margin={{ left: 20, right: 12, top: 12, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              angle={-45}
              dataKey="period"
              height={60}
              interval={0}
              style={{ fontSize: 12 }}
              textAnchor="end"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              style={{ fontSize: 12 }}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value: number) =>
                `$${(value / 1000).toFixed(0)}k`
              }
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <defs>
              <linearGradient id="fillAmount" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(142, 76%, 36%)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(142, 76%, 36%)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              {showOrders && (
                <linearGradient id="fillOrders" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--chart-2))"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--chart-2))"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              )}
            </defs>
            <Area
              dataKey="totalAmount"
              fill="url(#fillAmount)"
              fillOpacity={0.4}
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              type="monotone"
            />
            {showOrders && (
              <Area
                dataKey="totalOrders"
                fill="url(#fillOrders)"
                fillOpacity={0.4}
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                type="monotone"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
