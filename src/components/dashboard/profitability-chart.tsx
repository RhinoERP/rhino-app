/**
 * Profitability Chart - Professional Layout
 * Main chart for Clients (full width) + Brands and Products side by side below
 */

"use client";

import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
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
import type { ProfitabilityMetric } from "@/types/dashboard";

type ProfitabilityChartProps = {
  data: ProfitabilityMetric[];
  isLoading?: boolean;
  title: string;
  description: string;
  height?: number;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey?: string;
    payload?: {
      fullName: string;
      Ventas: number;
      Ganancia: number;
      margen: number;
      orderCount: number;
    };
  }>;
}) {
  if (!(active && payload?.length && payload[0].payload)) {
    return null;
  }

  const itemData = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-2 font-semibold text-sm">{itemData.fullName}</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: "hsl(142, 76%, 36%)" }}
            />
            <span className="text-muted-foreground">Ventas:</span>
          </div>
          <span className="font-semibold text-emerald-600">
            {formatCurrency(itemData.Ventas)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: "hsl(221, 83%, 53%)" }}
            />
            <span className="text-muted-foreground">Ganancia:</span>
          </div>
          <span className="font-semibold text-blue-600">
            {formatCurrency(itemData.Ganancia)}
          </span>
        </div>
        <div className="border-t pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Margen:</span>
            <span className="font-bold text-primary">
              {itemData.margen.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Pedidos:</span>
            <span className="font-semibold">{itemData.orderCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SingleChart({
  data,
  isLoading,
  title,
  description,
  height = 400,
}: ProfitabilityChartProps) {
  const chartData = data.map((item) => ({
    name: item.label.length > 20 ? `${item.label.slice(0, 20)}...` : item.label,
    fullName: item.label,
    Ventas: Number(item.revenue),
    Ganancia: Number(item.profit),
    margen: Number(item.margin_percent),
    orderCount: item.order_count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className={`h-[${height}px] w-full`} />
          </div>
        )}
        {!isLoading && chartData.length === 0 && (
          <div
            className={`flex h-[${height}px] items-center justify-center text-muted-foreground`}
          >
            <p className="text-center text-sm">
              No hay datos disponibles para el período seleccionado
            </p>
          </div>
        )}
        {!isLoading && chartData.length > 0 && (
          <ResponsiveContainer height={height} width="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 10, bottom: 60 }}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(142, 76%, 36%)"
                    stopOpacity={0.9}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(142, 76%, 36%)"
                    stopOpacity={0.7}
                  />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(221, 83%, 53%)"
                    stopOpacity={0.9}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(221, 83%, 53%)"
                    stopOpacity={0.7}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
              <XAxis
                angle={-45}
                className="fill-muted-foreground text-xs"
                dataKey="name"
                height={100}
                textAnchor="end"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                className="fill-muted-foreground text-xs"
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => formatCurrency(Number(value))}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              />
              <Legend
                iconType="square"
                wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }}
              />
              <Bar
                dataKey="Ventas"
                fill="url(#colorRevenue)"
                maxBarSize={60}
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="Ganancia"
                fill="url(#colorProfit)"
                maxBarSize={60}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export { SingleChart as ProfitabilityChartSingle };

export function ProfitabilityChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[400px] w-full" />
      </CardContent>
    </Card>
  );
}
