/**
 * Cash Flow Projection Chart
 * Simplified area chart showing projected income vs expenses over the next weeks
 */

"use client";

import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
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
import { formatCurrency } from "@/lib/format";
import type { WeeklyFlowProjection } from "@/types/dashboard";

type CashFlowProjectionChartProps = {
  data: WeeklyFlowProjection[];
};

type EnrichedWeeklyData = WeeklyFlowProjection & {
  net: number;
  cumulativeNet: number;
};

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
    dataKey?: string;
  }>;
  label?: string;
}) {
  if (!(active && payload) || payload.length === 0) {
    return null;
  }

  const income = payload.find((p) => p.dataKey === "income")?.value || 0;
  const expense = payload.find((p) => p.dataKey === "expense")?.value || 0;
  const cumulativeNet =
    payload.find((p) => p.dataKey === "cumulativeNet")?.value || 0;
  const net = income - expense;
  const margin = income > 0 ? ((net / income) * 100).toFixed(1) : "0.0";

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-2 font-semibold text-sm">{label}</p>{" "}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <ArrowUpIcon className="h-3 w-3 text-emerald-600" weight="bold" />
            <span className="text-muted-foreground">Ingresos:</span>
          </div>
          <span className="font-semibold text-emerald-600">
            {formatCurrency(income)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <ArrowDownIcon className="h-3 w-3 text-rose-600" weight="bold" />
            <span className="text-muted-foreground">Egresos:</span>
          </div>
          <span className="font-semibold text-rose-600">
            {formatCurrency(expense)}
          </span>
        </div>
        <div className="border-t pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              {net >= 0 ? (
                <ArrowUpIcon
                  className="h-3 w-3 text-emerald-600"
                  weight="bold"
                />
              ) : (
                <ArrowDownIcon
                  className="h-3 w-3 text-rose-600"
                  weight="bold"
                />
              )}
              <span className="text-muted-foreground">Neto Semanal:</span>
            </div>
            <span
              className={`font-bold ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatCurrency(net)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Margen:</span>
            <span className={net >= 0 ? "text-emerald-600" : "text-rose-600"}>
              {margin}%
            </span>
          </div>
        </div>
        <div className="border-t pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Balance Acumulado:</span>
            <span
              className={`font-bold ${cumulativeNet >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatCurrency(cumulativeNet)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CashFlowProjectionChart({
  data,
}: CashFlowProjectionChartProps) {
  // Enrich data with calculated fields
  const enrichedData: EnrichedWeeklyData[] = useMemo(() => {
    let cumulativeNet = 0;
    return data.map((week) => {
      const net = week.income - week.expense;
      cumulativeNet += net;
      return {
        ...week,
        week: week.week.replace("Week", "Semana"),
        net,
        cumulativeNet,
      };
    });
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Flujo de Caja Proyectado</CardTitle>
          <CardDescription>
            Proyección de ingresos y egresos para las próximas semanas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-muted-foreground text-sm">
              No hay suficientes datos de ventas y compras para generar una
              proyección confiable
            </p>
            <p className="text-muted-foreground text-xs">
              La proyección se basa en el historial de transacciones recientes
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flujo de Caja Proyectado</CardTitle>
        <CardDescription>
          Próximas {data.length} semanas basado en tendencias históricas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer height={400} width="100%">
          <AreaChart
            data={enrichedData}
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorIncome" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(142, 76%, 36%)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(142, 76%, 36%)"
                  stopOpacity={0.05}
                />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(0, 72%, 51%)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(0, 72%, 51%)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
            <XAxis
              className="text-xs"
              dataKey="week"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              className="text-xs"
              domain={[0, "auto"]}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => {
                const absValue = Math.abs(value);
                if (absValue >= 1_000_000) {
                  return `$${(value / 1_000_000).toFixed(1)}M`;
                }
                if (absValue >= 1000) {
                  return `$${(value / 1000).toFixed(0)}K`;
                }
                return `$${value}`;
              }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="line" wrapperStyle={{ paddingTop: "20px" }} />

            {/* Reference line at zero */}
            <ReferenceLine
              label={{
                value: "Punto de equilibrio",
                position: "insideBottomRight",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
              }}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              y={0}
            />

            {/* Income and Expense Areas */}
            <Area
              dataKey="income"
              fill="url(#colorIncome)"
              name="Ingresos"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2.5}
              type="monotone"
            />
            <Area
              dataKey="expense"
              fill="url(#colorExpense)"
              name="Egresos"
              stroke="hsl(0, 72%, 51%)"
              strokeWidth={2.5}
              type="monotone"
            />

            {/* Cumulative Net Balance Line */}
            <Line
              activeDot={{ r: 5 }}
              dataKey="cumulativeNet"
              dot={{ fill: "hsl(var(--primary))", r: 3 }}
              name="Balance Acumulado"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
