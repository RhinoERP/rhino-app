/**
 * Margins by Category Chart V3
 * Professional bar chart showing profit margins per product category
 * Features:
 * - Dynamic color coding based on margin levels
 * - Detailed tooltips with revenue, profit, and cost breakdown
 * - Reference lines for average margin and break-even point
 * - Summary statistics with total revenue and profit
 * - Value labels on bars
 */

"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ReferenceLine,
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
import { formatCurrency, formatPercentage } from "@/lib/format";
import type { CategoryMargin } from "@/types/dashboard";

type MarginsByCategoryChartProps = {
  data: CategoryMargin[];
};

// Función para determinar color basado en el margen
const getMarginColor = (margin: number) => {
  if (margin < 0) {
    return "hsl(0, 84%, 60%)"; // 🔴 Rojo para márgenes negativos (pérdida)
  }
  if (margin < 20) {
    return "hsl(38, 92%, 50%)"; // 🟠 Naranja para márgenes bajos (<20%)
  }
  if (margin < 40) {
    return "hsl(142, 76%, 36%)"; // 🟢 Verde para márgenes medios (20-40%)
  }
  return "hsl(142, 71%, 45%)"; // 💚 Verde brillante para márgenes altos (>40%)
};

// Función para determinar badge variant basado en el margen
const _getMarginBadgeVariant = (
  margin: number
): "destructive" | "secondary" | "default" => {
  if (margin < 0) {
    return "destructive";
  }
  if (margin < 20) {
    return "secondary";
  }
  return "default";
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: CategoryMargin & { marginDisplay: number; profitAmount: number };
  }>;
}) {
  if (!(active && payload) || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-4 shadow-xl">
      <p className="mb-3 font-bold text-base">{data.category}</p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Margen:</span>
          <span
            className="font-bold text-base"
            style={{ color: getMarginColor(data.margin) }}
          >
            {formatPercentage(data.margin)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Ingresos:</span>
          <span className="font-semibold">{formatCurrency(data.revenue)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Ganancia:</span>
          <span className="font-semibold text-emerald-600">
            {formatCurrency(data.profitAmount)}
          </span>
        </div>
        <div className="border-t pt-2">
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground text-xs">
              Costo estimado:
            </span>
            <span className="text-xs">
              {formatCurrency(data.revenue - data.profitAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarginsByCategoryChart({ data }: MarginsByCategoryChartProps) {
  const chartData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        marginDisplay: Number(item.margin.toFixed(2)),
        profitAmount: (item.revenue * item.margin) / 100,
      })),
    [data]
  );

  const averageMargin = useMemo(() => {
    if (data.length === 0) {
      return 0;
    }
    const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
    const weightedMargin = data.reduce(
      (sum, item) => sum + item.margin * item.revenue,
      0
    );
    return totalRevenue > 0 ? weightedMargin / totalRevenue : 0;
  }, [data]);

  const totalRevenue = useMemo(
    () => data.reduce((sum, item) => sum + item.revenue, 0),
    [data]
  );

  const totalProfit = useMemo(
    () => chartData.reduce((sum, item) => sum + item.profitAmount, 0),
    [chartData]
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Márgenes por Categoría</CardTitle>
          <CardDescription>
            Análisis de rentabilidad por categoría de producto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm">
            No hay datos suficientes para mostrar el análisis de márgenes
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Márgenes por Categoría</span>
          <span className="font-normal text-muted-foreground text-sm">
            {data.length} {data.length === 1 ? "categoría" : "categorías"}
          </span>
        </CardTitle>
        <CardDescription className="space-y-1">
          <div className="flex items-center justify-between">
            <span>Margen promedio ponderado:</span>
            <span
              className="font-semibold"
              style={{ color: getMarginColor(averageMargin) }}
            >
              {formatPercentage(averageMargin)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Ganancia total estimada:</span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(totalProfit)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Ingresos totales:</span>
            <span className="font-medium">{formatCurrency(totalRevenue)}</span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer height={400} width="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid
              className="stroke-muted"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              angle={-45}
              className="text-xs"
              dataKey="category"
              height={80}
              interval={0}
              textAnchor="end"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis
              className="text-xs"
              domain={[
                (dataMin: number) => Math.min(dataMin - 10, -10),
                "auto",
              ]}
              label={{
                value: "Margen de Ganancia (%)",
                angle: -90,
                position: "insideLeft",
                style: {
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 12,
                  fontWeight: 500,
                },
              }}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(0,0,0,0.05)" }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
            />
            {/* Línea de referencia en 0% */}
            <ReferenceLine
              label={{ value: "0%", position: "right", fontSize: 10 }}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              y={0}
            />
            {/* Línea de referencia del promedio */}
            <ReferenceLine
              label={{
                value: `Promedio: ${averageMargin.toFixed(1)}%`,
                position: "right",
                fontSize: 10,
                fill: "hsl(142, 76%, 36%)",
              }}
              stroke="hsl(142, 76%, 36%)"
              strokeDasharray="5 5"
              strokeWidth={2}
              y={averageMargin}
            />
            <Bar dataKey="marginDisplay" name="Margen %" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  fill={getMarginColor(entry.margin)}
                  key={`cell-${entry.category}-${index}`}
                  stroke={getMarginColor(entry.margin)}
                  strokeWidth={entry.margin < 0 ? 2 : 0}
                />
              ))}
              <LabelList
                dataKey="marginDisplay"
                position="top"
                style={{ fontSize: "10px", fontWeight: "600" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
