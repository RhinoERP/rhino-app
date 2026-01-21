"use client";

import { ChartLine, TrendUp as TrendUpIcon } from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
import type { HistoricalPurchaseMetric } from "@/modules/purchases/historical/types";
import type { HistoricalSalesMetric } from "@/modules/sales/historical/types";

type HistoricalTrendChartProps = {
  salesData: HistoricalSalesMetric[];
  purchasesData: HistoricalPurchaseMetric[];
  isLoadingSales?: boolean;
  isLoadingPurchases?: boolean;
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

/**
 * Format period date to display label
 */
function formatPeriodLabel(periodDate: string): string {
  const date = new Date(periodDate);
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${month} ${year}`;
}

/**
 * Merge sales and purchases data by period
 */
function mergeHistoricalData(
  salesData: HistoricalSalesMetric[],
  purchasesData: HistoricalPurchaseMetric[]
): Array<{ period: string; sales: number; purchases: number }> {
  const periodMap = new Map<
    string,
    { period: string; sales: number; purchases: number }
  >();

  // Add sales data
  for (const item of salesData || []) {
    periodMap.set(item.period, {
      period: formatPeriodLabel(item.period),
      sales: Number(item.total_amount),
      purchases: 0,
    });
  }

  // Add purchases data
  for (const item of purchasesData || []) {
    const existing = periodMap.get(item.period);
    if (existing) {
      existing.purchases = Number(item.total_amount);
    } else {
      periodMap.set(item.period, {
        period: formatPeriodLabel(item.period),
        sales: 0,
        purchases: Number(item.total_amount),
      });
    }
  }

  // Convert to array and sort by period
  return Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

/**
 * Calculate metrics from chart data
 */
function calculateMetrics(
  chartData: Array<{ sales: number; purchases: number }>
) {
  const totalSales = chartData.reduce((sum, item) => sum + item.sales, 0);
  const totalPurchases = chartData.reduce(
    (sum, item) => sum + item.purchases,
    0
  );
  const totalMargin = totalSales - totalPurchases;
  const marginPercentage =
    totalSales > 0 ? (totalMargin / totalSales) * 100 : 0;

  return { totalSales, totalPurchases, totalMargin, marginPercentage };
}

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
            {entry.dataKey === "sales" ? "Ventas" : "Compras"}:
          </span>
          <span className="font-medium text-sm">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Margen:</span>
            <span
              className={`font-medium text-sm ${
                payload[0].value - payload[1].value > 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {formatCurrency(payload[0].value - payload[1].value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoricalTrendChart({
  salesData,
  purchasesData,
  isLoadingSales = false,
  isLoadingPurchases = false,
}: HistoricalTrendChartProps) {
  const isLoading = isLoadingSales || isLoadingPurchases;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasSalesData = salesData && salesData.length > 0;
  const hasPurchasesData = purchasesData && purchasesData.length > 0;

  if (!(hasSalesData || hasPurchasesData)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tendencia Histórica de Ventas y Compras</CardTitle>
          <CardDescription>
            Comparación de ventas y compras importadas por mes
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-[400px] items-center justify-center">
          <div className="text-center text-muted-foreground">
            <ChartLine className="mx-auto mb-2 h-12 w-12 opacity-20" />
            <p className="text-sm">No hay datos históricos disponibles</p>
            <p className="mt-1 text-xs">
              Importa datos desde la sección de Importar Datos
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Merge and process data
  const chartData = mergeHistoricalData(salesData || [], purchasesData || []);
  const { totalSales, totalPurchases, totalMargin, marginPercentage } =
    calculateMetrics(chartData);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendUpIcon className="h-5 w-5" />
          Tendencia Histórica de Ventas y Compras
        </CardTitle>
        <CardDescription>
          Comparación mensual de ingresos y gastos importados
        </CardDescription>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Total Ventas</p>
            <p className="font-bold text-2xl text-green-600">
              {formatCurrency(totalSales)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Total Compras</p>
            <p className="font-bold text-2xl text-orange-600">
              {formatCurrency(totalPurchases)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Margen Total</p>
            <p
              className={`font-bold text-2xl ${
                totalMargin > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(totalMargin)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">% Margen</p>
            <p
              className={`font-bold text-2xl ${
                marginPercentage > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {marginPercentage.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer height={400} width="100%">
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
            <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
            <defs>
              <linearGradient id="fillSales" x1="0" x2="0" y1="0" y2="1">
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
              <linearGradient id="fillPurchases" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(24, 100%, 50%)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(24, 100%, 50%)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            {hasSalesData && (
              <Area
                dataKey="sales"
                fill="url(#fillSales)"
                fillOpacity={0.4}
                name="Ventas"
                stroke="hsl(142, 76%, 36%)"
                strokeWidth={2}
                type="monotone"
              />
            )}
            {hasPurchasesData && (
              <Area
                dataKey="purchases"
                fill="url(#fillPurchases)"
                fillOpacity={0.4}
                name="Compras"
                stroke="hsl(24, 100%, 50%)"
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
