/**
 * Financial Tab V2 - Administración de Saldos
 * Financial balance and aging analysis with cash flow projection
 */

"use client";

import {
  ClockIcon,
  CurrencyDollarIcon,
  TrendDownIcon,
  TrendUpIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import {
  useControlTowerData,
  useFinancialData,
} from "@/modules/dashboard/hooks/use-dashboard";
import type { DashboardFilters } from "@/types/dashboard";
import { CashFlowProjectionChart } from "./cash-flow-projection-chart";
import { FinancialBreakdownCards } from "./financial-breakdown-cards";
import { FinancialBreakdownChart } from "./financial-breakdown-chart";

type FinancialTabProps = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
  filters?: DashboardFilters;
};

function DualCurrencyAmount({
  ars,
  usd,
  className,
}: {
  ars: number;
  usd?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="font-bold text-2xl">{formatCurrency(ars)}</div>
      {usd != null && usd > 0 && (
        <div className="text-muted-foreground text-xs">
          {formatCurrency(usd, "USD")}
        </div>
      )}
    </div>
  );
}

export function FinancialTab({
  orgSlug,
  startDate,
  endDate,
  filters = {},
}: FinancialTabProps) {
  const {
    data: financialData,
    isPending: isPendingFinancial,
    isError: isErrorFinancial,
  } = useFinancialData(orgSlug, startDate, endDate, filters);
  const {
    data: controlTowerData,
    isPending: isPendingControl,
    isError: isErrorControl,
  } = useControlTowerData(orgSlug, startDate, endDate, filters);

  if (isPendingFinancial || isPendingControl) {
    return <FinancialSkeleton />;
  }

  if (isErrorFinancial || isErrorControl || !financialData) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-12 text-center">
        <WarningIcon className="size-8 text-destructive" weight="duotone" />
        <p className="font-semibold text-destructive">
          No se pudo cargar la información
        </p>
        <p className="text-muted-foreground text-sm">
          Hubo un error al obtener los datos. Por favor, recargar la página y si
          el error persiste podés contactar al administrador.
        </p>
      </div>
    );
  }

  const { balance, breakdown } = financialData;

  // Calculate percentages for aging visualization
  const totalDebt =
    balance.aging.days1_7 +
    balance.aging.days8_14 +
    balance.aging.days15_30 +
    balance.aging.days31_60 +
    balance.aging.over60;

  return (
    <div className="space-y-6">
      {/* Main Financial Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Invoiced */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <CurrencyDollarIcon
                className="h-4 w-4 text-muted-foreground"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">
              Total Facturado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DualCurrencyAmount
              ars={breakdown.invoicing.total}
              className="font-bold text-2xl"
            />
            <p className="text-muted-foreground text-xs">
              Distribuidora + venta directa
            </p>
          </CardContent>
        </Card>

        {/* Collected */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <TrendUpIcon
                className="h-4 w-4 text-green-500"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">Cobrado</CardTitle>
          </CardHeader>
          <CardContent>
            <DualCurrencyAmount
              ars={balance.collected}
              className="text-green-600"
              usd={balance.collectedUSD}
            />
            <p className="text-muted-foreground text-xs">Ingresos efectivos</p>
          </CardContent>
        </Card>

        {/* To Collect */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <ClockIcon className="h-4 w-4 text-yellow-500" weight="duotone" />
            </div>
            <CardTitle className="font-medium text-sm">Por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <DualCurrencyAmount
              ars={balance.toCollect}
              className="text-yellow-600"
              usd={balance.toCollectUSD}
            />
            <p className="text-muted-foreground text-xs">Cuentas pendientes</p>
          </CardContent>
        </Card>

        {/* To Pay */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <TrendDownIcon
                className="h-4 w-4 text-red-500"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">Por Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <DualCurrencyAmount
              ars={balance.toPay}
              className="text-red-600"
              usd={balance.toPayUSD}
            />
            <p className="text-muted-foreground text-xs">Obligaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Margin Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Análisis de Márgenes</CardTitle>
          <CardDescription>
            Rentabilidad del periodo seleccionado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">Margen Bruto</p>
              <p className="font-bold text-3xl">
                {balance.margin.percentage.toFixed(1)}%
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">Ganancia Neta</p>
              <DualCurrencyAmount
                ars={balance.margin.amount}
                className="text-green-600"
                usd={balance.margin.amountUSD}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <FinancialBreakdownCards breakdown={breakdown} />

      <FinancialBreakdownChart breakdown={breakdown} />

      {/* Cash Flow Projection */}
      <CashFlowProjectionChart
        data={controlTowerData?.cashFlowProjection ?? []}
      />

      {/* Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClockIcon className="size-5" weight="duotone" />
            Antigüedad de Cuentas por Cobrar
          </CardTitle>
          <CardDescription>
            Distribución por antigüedad de todas las cuentas pendientes - Total:{" "}
            {formatCurrency(totalDebt)}
          </CardDescription>
          {totalDebt !== balance.toCollect && balance.toCollect > 0 && (
            <p className="mt-1 text-muted-foreground text-xs">
              Nota: Incluye cuentas anteriores al periodo. Cuentas del periodo:{" "}
              {formatCurrency(balance.toCollect)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <AgingRow
            amount={balance.aging.days1_7}
            barClassName="h-2"
            label="Vigente (0-7 días)"
            totalDebt={totalDebt}
            usd={balance.aging.days1_7USD}
          />
          <AgingRow
            amount={balance.aging.days8_14}
            barClassName="h-2 [&>div]:bg-blue-500"
            label="8-14 días"
            totalDebt={totalDebt}
            usd={balance.aging.days8_14USD}
          />
          <AgingRow
            amount={balance.aging.days15_30}
            barClassName="h-2 [&>div]:bg-yellow-500"
            label="15-30 días"
            totalDebt={totalDebt}
            usd={balance.aging.days15_30USD}
          />
          <AgingRow
            amount={balance.aging.days31_60}
            barClassName="h-2 [&>div]:bg-orange-500"
            label="31-60 días"
            totalDebt={totalDebt}
            usd={balance.aging.days31_60USD}
          />
          <AgingRow
            alert={balance.aging.over60 > 0}
            amount={balance.aging.over60}
            barClassName="h-2 [&>div]:bg-red-700"
            label="60+ días"
            totalDebt={totalDebt}
            usd={balance.aging.over60USD}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AgingRow({
  label,
  amount,
  usd,
  totalDebt,
  barClassName,
  alert = false,
}: {
  label: string;
  amount: number;
  usd: number;
  totalDebt: number;
  barClassName: string;
  alert?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-right">
          <span className="block font-semibold text-sm">
            {formatCurrency(amount)}
          </span>
          {usd > 0 && (
            <span className="block text-muted-foreground text-xs">
              {formatCurrency(usd, "USD")}
            </span>
          )}
        </span>
      </div>
      <Progress
        className={barClassName}
        value={totalDebt > 0 ? (amount / totalDebt) * 100 : 0}
      />
      {alert && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 dark:bg-red-950/10">
          <WarningIcon
            className="mt-0.5 size-5 text-red-600"
            weight="duotone"
          />
          <div>
            <p className="font-semibold text-red-900 text-sm dark:text-red-100">
              Atención: Deuda Vencida
            </p>
            <p className="text-red-700 text-sm dark:text-red-300">
              Hay {formatCurrency(amount)} en cuentas con más de 60 días de
              antigüedad. Se recomienda acción inmediata de cobranza.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialSkeleton() {
  return (
    <div className="space-y-6">
      {/* Main Financial Metrics Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => `metric-skeleton-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-28" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Large Cards Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => `large-card-skeleton-${i}`).map(
          (key) => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-96 w-full" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Alert Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
