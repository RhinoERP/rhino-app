import {
  ArrowDownIcon,
  ArrowUpIcon,
  ScalesIcon,
} from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { FinancialResults } from "@/modules/finances/types";

type ResultsSummaryProps = {
  results: FinancialResults;
};

export function ResultsSummary({ results }: ResultsSummaryProps) {
  const isPositive = results.netResult >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ArrowUpIcon className="size-4 text-green-500" weight="bold" />
          </div>
          <CardTitle className="font-medium text-sm">Ingresos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold font-mono text-2xl text-green-600">
            {formatCurrency(results.totalRevenue)}
          </div>
          {results.returns > 0 && (
            <p className="mt-0.5 text-muted-foreground text-xs">
              Cobros {formatCurrency(results.salesRevenue)} · Créditos{" "}
              {formatCurrency(results.returns)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ArrowDownIcon className="size-4 text-red-500" weight="bold" />
          </div>
          <CardTitle className="font-medium text-sm">Egresos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-bold font-mono text-2xl text-red-600">
            {formatCurrency(results.totalExpenses)}
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            Prov. {formatCurrency(results.purchasesAmount)} · Gastos{" "}
            {formatCurrency(results.fixedExpenses + results.variableExpenses)}
          </p>
        </CardContent>
      </Card>

      <Card
        className={
          isPositive
            ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
            : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"
        }
      >
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <ScalesIcon className="size-4" weight="bold" />
          </div>
          <CardTitle className="font-medium text-sm">Resultado neto</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`font-bold font-mono text-2xl ${
              isPositive
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatCurrency(results.netResult)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
