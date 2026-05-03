"use client";

import { useQuery } from "@tanstack/react-query";
import { DollarSign, Percent, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercentage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { customerProfitabilityClientQueryOptions } from "@/modules/dashboard/queries/customer-profitability.client";
import type {
  CustomerProfitabilityRow,
  CustomerProfitabilityStatus,
} from "@/types/dashboard";

type RentabilidadClientesProps = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
};

type ChartPayload = {
  payload?: {
    fullName: string;
    sales: number;
    profit: number;
    margin: number;
  };
};

const MONEY_AXIS_WIDTH = 96;

function getBadgeClass(status: CustomerProfitabilityStatus) {
  if (status === "bueno") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "regular") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

function formatAxisCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ChartPayload[];
}) {
  const item = payload?.[0]?.payload;

  if (!(active && item)) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 shadow-xl">
      <p className="mb-2 max-w-64 truncate font-medium text-sm">
        {item.fullName}
      </p>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-300">Ventas</span>
          <span className="font-semibold text-emerald-300">
            {formatCurrency(item.sales)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-300">Ganancia</span>
          <span className="font-semibold text-sky-300">
            {formatCurrency(item.profit)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-slate-300">Margen</span>
          <span className="font-semibold text-orange-300">
            {formatPercentage(item.margin, 1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof DollarSign;
  iconClassName: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border">
          <Icon
            className={cn("h-4 w-4 text-muted-foreground", iconClassName)}
          />
        </div>
        <CardTitle className="font-medium text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate font-bold text-2xl">{value}</div>
        <p className="text-muted-foreground text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  customer,
  index,
  maxSales,
}: {
  customer: CustomerProfitabilityRow;
  index: number;
  maxSales: number;
}) {
  const salesWidth = maxSales > 0 ? (customer.totalSales / maxSales) * 100 : 0;
  const profitWidth =
    maxSales > 0 ? (Math.max(customer.totalProfit, 0) / maxSales) * 100 : 0;

  return (
    <div className="grid gap-4 border-b py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_120px_90px_96px] md:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-sm">
            #{index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{customer.customerName}</p>
            <p className="text-muted-foreground text-xs">
              {customer.orderCount} ventas
            </p>
          </div>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-green-500"
            style={{ width: `${salesWidth}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
            style={{ width: `${profitWidth}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-muted-foreground text-xs md:hidden">Ventas</span>
        <span className="font-medium">
          {formatCurrency(customer.totalSales)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-muted-foreground text-xs md:hidden">
          Ganancia
        </span>
        <span className="font-medium">
          {formatCurrency(customer.totalProfit)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-muted-foreground text-xs md:hidden">Margen</span>
        <span className="font-medium">
          {formatPercentage(customer.marginPercent, 1)}
        </span>
      </div>
      <div className="flex justify-end md:justify-start">
        <Badge
          className={cn("capitalize", getBadgeClass(customer.status))}
          variant="outline"
        >
          {customer.status}
        </Badge>
      </div>
    </div>
  );
}

function RentabilidadClientesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => `kpi-${index}`).map((key) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-lg">
        <CardContent className="p-6">
          <Skeleton className="h-[390px] w-full" />
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardContent className="space-y-4 p-6">
          {Array.from({ length: 6 }, (_, index) => `row-${index}`).map(
            (key) => (
              <Skeleton className="h-14 w-full" key={key} />
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function RentabilidadClientes({
  orgSlug,
  startDate,
  endDate,
}: RentabilidadClientesProps) {
  const { data, error, isPending } = useQuery(
    customerProfitabilityClientQueryOptions(orgSlug, startDate, endDate)
  );

  if (isPending) {
    return <RentabilidadClientesSkeleton />;
  }

  if (error) {
    return (
      <Card className="rounded-lg border-destructive/50 bg-destructive/10">
        <CardContent className="p-6">
          <h3 className="font-semibold text-destructive">
            Error cargando rentabilidad por clientes
          </h3>
          <p className="mt-2 text-destructive text-sm">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const chartData =
    data?.topCustomers.map((customer) => ({
      name:
        customer.customerName.length > 16
          ? `${customer.customerName.slice(0, 16)}...`
          : customer.customerName,
      fullName: customer.customerName,
      sales: customer.totalSales,
      profit: customer.totalProfit,
      margin: customer.marginPercent,
    })) ?? [];

  const customers = data?.customers ?? [];
  const maxSales = customers[0]?.totalSales ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          description="Importe total vendido"
          icon={DollarSign}
          iconClassName="text-emerald-600"
          title="Ventas totales"
          value={formatCurrency(data?.kpis.totalSales ?? 0)}
        />
        <KpiCard
          description="Resultado bruto del periodo"
          icon={TrendingUp}
          iconClassName="text-sky-600"
          title="Ganancia total"
          value={formatCurrency(data?.kpis.totalProfit ?? 0)}
        />
        <KpiCard
          description="Ganancia sobre ventas"
          icon={Percent}
          iconClassName="text-orange-600"
          title="Margen promedio"
          value={formatPercentage(data?.kpis.averageMarginPercent ?? 0, 1)}
        />
        <KpiCard
          description="Clientes con ventas"
          icon={Users}
          iconClassName="text-violet-600"
          title="Clientes activos"
          value={(data?.kpis.activeCustomers ?? 0).toLocaleString("es-AR")}
        />
      </div>

      <Card className="rounded-lg">
        <CardContent className="p-4">
          {chartData.length === 0 ? (
            <div className="flex h-[390px] items-center justify-center text-muted-foreground text-sm">
              No hay datos disponibles para el período seleccionado
            </div>
          ) : (
            <ResponsiveContainer height={390} width="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 18, right: 20, bottom: 36, left: 4 }}
              >
                <XAxis
                  angle={-35}
                  axisLine={false}
                  dataKey="name"
                  height={68}
                  interval={0}
                  textAnchor="end"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => formatAxisCurrency(Number(value))}
                  tickLine={false}
                  width={MONEY_AXIS_WIDTH}
                  yAxisId="money"
                />
                <YAxis
                  axisLine={false}
                  orientation="right"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                  tickLine={false}
                  width={48}
                  yAxisId="margin"
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                />
                <Bar
                  dataKey="sales"
                  fill="#22c55e"
                  maxBarSize={54}
                  name="Ventas"
                  radius={[6, 6, 0, 0]}
                  yAxisId="money"
                />
                <Bar
                  dataKey="profit"
                  fill="#3b82f6"
                  maxBarSize={28}
                  name="Ganancia"
                  radius={[6, 6, 0, 0]}
                  yAxisId="money"
                />
                <Line
                  activeDot={{ r: 6 }}
                  dataKey="margin"
                  dot={{ r: 4 }}
                  name="Margen"
                  stroke="#f97316"
                  strokeWidth={3}
                  type="monotone"
                  yAxisId="margin"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Detalle por Cliente</CardTitle>
          <CardDescription>
            Ordenado por ventas de mayor a menor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_90px_96px] gap-4 border-b pb-3 text-muted-foreground text-xs md:grid">
            <span>Cliente</span>
            <span>Ventas</span>
            <span>Ganancia</span>
            <span>Margen</span>
            <span>Estado</span>
          </div>
          {customers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No hay clientes con ventas en el período seleccionado
            </div>
          ) : (
            customers.map((customer, index) => (
              <DetailRow
                customer={customer}
                index={index}
                key={customer.customerId}
                maxSales={maxSales}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
