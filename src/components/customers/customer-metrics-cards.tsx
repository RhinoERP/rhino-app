"use client";

import {
  ArrowSquareOutIcon,
  CurrencyCircleDollarIcon,
  FileTextIcon,
  ShoppingCartIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CustomerStats } from "@/modules/customers/types";
import type { QuoteMetrics } from "@/modules/quotes/types";

type CustomerMetricsCardsProps = {
  stats: CustomerStats;
  quoteMetrics: QuoteMetrics;
};

export function CustomerMetricsCards({
  stats,
  quoteMetrics,
}: CustomerMetricsCardsProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <ShoppingCartIcon className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Pedidos</CardTitle>
            </div>
            <div className="text-right">
              <p className="font-semibold text-2xl">{stats.totalSales}</p>
              <CardDescription>Total</CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CurrencyCircleDollarIcon className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">Monto total</CardTitle>
            </div>
            <div className="text-right">
              <p className="font-semibold text-2xl">
                {formatCurrency(stats.totalAmount)}
              </p>
              <CardDescription>Histórico</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <FileTextIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Presupuestos</CardTitle>
                <CardDescription className="mt-0.5">Total</CardDescription>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-3xl">{quoteMetrics.totalQuotes}</p>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                <ArrowSquareOutIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Convertidos</CardTitle>
                <CardDescription className="mt-0.5">
                  Pedidos generados
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-3xl">
                {quoteMetrics.convertedQuotes}
              </p>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2.5 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <XCircleIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Cancelados</CardTitle>
                <CardDescription className="mt-0.5">
                  Rechazados/Cambios solicitados
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-3xl">
                {quoteMetrics.cancelledQuotes}
              </p>
            </div>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
