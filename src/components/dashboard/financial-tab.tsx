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
import { formatCurrency } from "@/lib/format";
import {
  useControlTowerData,
  useFinancialData,
} from "@/modules/dashboard/hooks/use-dashboard";
import { CashFlowProjectionChart } from "./cash-flow-projection-chart";

type FinancialTabProps = {
  orgSlug: string;
  startDate: Date;
  endDate: Date;
};

export function FinancialTab({
  orgSlug,
  startDate,
  endDate,
}: FinancialTabProps) {
  const { data: financialData, isLoading: isLoadingFinancial } =
    useFinancialData(orgSlug, startDate, endDate);
  const { data: controlTowerData, isLoading: isLoadingControl } =
    useControlTowerData(orgSlug, startDate, endDate, {});

  if (
    isLoadingFinancial ||
    isLoadingControl ||
    !financialData ||
    !controlTowerData
  ) {
    return <div>Cargando...</div>;
  }

  const { balance } = financialData;

  // Calculate percentages for aging visualization
  const totalDebt =
    balance.aging.current +
    balance.aging.days1_30 +
    balance.aging.days31_60 +
    balance.aging.days61_90 +
    balance.aging.over90;

  return (
    <div className="space-y-6">
      {/* Main Financial Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Invoiced */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">
              Total Facturado
            </CardTitle>
            <CurrencyDollarIcon
              className="size-4 text-muted-foreground"
              weight="duotone"
            />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl">
              {formatCurrency(balance.invoiced)}
            </div>
            <p className="text-muted-foreground text-xs">En el periodo</p>
          </CardContent>
        </Card>

        {/* Collected */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Cobrado</CardTitle>
            <TrendUpIcon className="size-4 text-green-500" weight="duotone" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl text-green-600">
              {formatCurrency(balance.collected)}
            </div>
            <p className="text-muted-foreground text-xs">Ingresos efectivos</p>
          </CardContent>
        </Card>

        {/* To Collect */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Por Cobrar</CardTitle>
            <ClockIcon className="size-4 text-yellow-500" weight="duotone" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl text-yellow-600">
              {formatCurrency(balance.toCollect)}
            </div>
            <p className="text-muted-foreground text-xs">Cuentas pendientes</p>
          </CardContent>
        </Card>

        {/* To Pay */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Por Pagar</CardTitle>
            <TrendDownIcon className="size-4 text-red-500" weight="duotone" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="font-bold text-2xl text-red-600">
              {formatCurrency(balance.toPay)}
            </div>
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
              <p className="font-bold text-2xl text-green-600">
                {formatCurrency(balance.margin.amount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow Projection */}
      <CashFlowProjectionChart data={controlTowerData.cashFlowProjection} />

      {/* Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClockIcon className="size-5" weight="duotone" />
            Antigüedad de Cuentas por Cobrar
          </CardTitle>
          <CardDescription>
            Distribución por antigüedad - Total: {formatCurrency(totalDebt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current (Not overdue) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Vigente (0 días)</span>
              <span className="font-semibold text-sm">
                {formatCurrency(balance.aging.current)}
              </span>
            </div>
            <Progress
              className="h-2"
              value={
                totalDebt > 0 ? (balance.aging.current / totalDebt) * 100 : 0
              }
            />
          </div>

          {/* 1-30 days */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">1-30 días</span>
              <span className="font-semibold text-sm text-yellow-600">
                {formatCurrency(balance.aging.days1_30)}
              </span>
            </div>
            <Progress
              className="h-2 [&>div]:bg-yellow-500"
              value={
                totalDebt > 0 ? (balance.aging.days1_30 / totalDebt) * 100 : 0
              }
            />
          </div>

          {/* 31-60 days */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">31-60 días</span>
              <span className="font-semibold text-orange-600 text-sm">
                {formatCurrency(balance.aging.days31_60)}
              </span>
            </div>
            <Progress
              className="h-2 [&>div]:bg-orange-500"
              value={
                totalDebt > 0 ? (balance.aging.days31_60 / totalDebt) * 100 : 0
              }
            />
          </div>

          {/* 61-90 days */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">61-90 días</span>
              <span className="font-semibold text-red-600 text-sm">
                {formatCurrency(balance.aging.days61_90)}
              </span>
            </div>
            <Progress
              className="h-2 [&>div]:bg-red-500"
              value={
                totalDebt > 0 ? (balance.aging.days61_90 / totalDebt) * 100 : 0
              }
            />
          </div>

          {/* Over 90 days */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">+90 días</span>
              <span className="font-semibold text-red-700 text-sm">
                {formatCurrency(balance.aging.over90)}
              </span>
            </div>
            <Progress
              className="h-2 [&>div]:bg-red-700"
              value={
                totalDebt > 0 ? (balance.aging.over90 / totalDebt) * 100 : 0
              }
            />
          </div>

          {balance.aging.over90 > 0 && (
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
                  Hay {formatCurrency(balance.aging.over90)} en cuentas con más
                  de 90 días de antigüedad. Se recomienda acción inmediata de
                  cobranza.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
