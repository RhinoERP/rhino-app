import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react/ssr";
import { formatCurrency } from "@/lib/format";
import type { FinancialResults } from "@/modules/finances/types";

type PendingPositionProps = {
  results: FinancialResults;
};

export function PendingPosition({ results }: PendingPositionProps) {
  const net = results.pendingReceivables - results.pendingPayables;
  const isPositive = net >= 0;

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="mb-4 font-semibold text-sm">Posición pendiente</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <ArrowDownIcon className="size-3.5 text-green-500" weight="bold" />
            Por cobrar
          </div>
          <p className="mt-0.5 font-mono font-semibold text-green-700 dark:text-green-400">
            {formatCurrency(results.pendingReceivables)}
          </p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <ArrowUpIcon className="size-3.5 text-red-500" weight="bold" />
            Por pagar
          </div>
          <p className="mt-0.5 font-mono font-semibold text-red-700 dark:text-red-400">
            {formatCurrency(results.pendingPayables)}
          </p>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">
            Saldo neto pendiente
          </div>
          <p
            className={`mt-0.5 font-mono font-semibold ${
              isPositive
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatCurrency(net)}
          </p>
        </div>
      </div>
    </div>
  );
}
