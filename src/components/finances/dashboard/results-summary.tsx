import {
  ArrowDownIcon,
  ArrowUpIcon,
  ScalesIcon,
} from "@phosphor-icons/react/ssr";
import { formatCurrency } from "@/lib/format";
import type { FinancialResults } from "@/modules/finances/types";

type ResultsSummaryProps = {
  results: FinancialResults;
};

export function ResultsSummary({ results }: ResultsSummaryProps) {
  const isPositive = results.netResult >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ArrowUpIcon className="size-4 text-green-500" weight="bold" />
          Ingresos
        </div>
        <p className="mt-1 font-bold font-mono text-2xl text-green-600">
          {formatCurrency(results.totalRevenue)}
        </p>
        {results.returns > 0 && (
          <p className="mt-0.5 text-muted-foreground text-xs">
            Cobros {formatCurrency(results.salesRevenue)} · Créditos{" "}
            {formatCurrency(results.returns)}
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ArrowDownIcon className="size-4 text-red-500" weight="bold" />
          Egresos
        </div>
        <p className="mt-1 font-bold font-mono text-2xl text-red-600">
          {formatCurrency(results.totalExpenses)}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Prov. {formatCurrency(results.purchasesAmount)} · Gastos{" "}
          {formatCurrency(results.fixedExpenses + results.variableExpenses)}
        </p>
      </div>

      <div
        className={`rounded-lg border bg-card p-5 ${
          isPositive
            ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
            : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"
        }`}
      >
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ScalesIcon className="size-4" weight="bold" />
          Resultado neto
        </div>
        <p
          className={`mt-1 font-bold font-mono text-2xl ${
            isPositive
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {formatCurrency(results.netResult)}
        </p>
      </div>
    </div>
  );
}
