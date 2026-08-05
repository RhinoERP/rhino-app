import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockCounterClockwiseIcon,
} from "@phosphor-icons/react/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { FinancialResults } from "@/modules/finances/types";

type PendingPositionProps = {
  results: FinancialResults;
};

export function PendingPosition({ results }: PendingPositionProps) {
  const net = results.pendingReceivables - results.pendingPayables;
  const isPositive = net >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold text-sm">
          Posición pendiente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <ArrowDownIcon
                className="size-3.5 text-green-500"
                weight="bold"
              />
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
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <ClockCounterClockwiseIcon
                className="size-3.5 text-blue-500"
                weight="bold"
              />
              Futuro por liquidar
            </div>
            <p className="mt-0.5 font-mono font-semibold text-blue-700 dark:text-blue-400">
              {formatCurrency(results.deferredAdvanceBalance)}
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {results.deferredAdvanceCount === 1
                ? "1 venta con anticipo activo"
                : `${results.deferredAdvanceCount} ventas con anticipos activos`}
              {" · no exigible aún"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
