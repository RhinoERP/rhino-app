import {
  CalendarXIcon,
  CurrencyDollarSimpleIcon,
  HandCoinsIcon,
  PiggyBankIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type {
  PayablesMetrics,
  ReceivablesMetrics,
} from "@/modules/collections/types";

type CollectionsMetricsProps = {
  receivablesMetrics: ReceivablesMetrics;
  payablesMetrics: PayablesMetrics;
  wholesaleEnabled: boolean;
};

type CurrencyAmount = { currency: string; amount: number };

function CurrencyAmounts({ values }: { values: CurrencyAmount[] }) {
  if (values.length === 0) {
    return <div className="font-bold text-2xl">{formatCurrency(0)}</div>;
  }
  return (
    <div className="space-y-1">
      {values.map(({ currency, amount }) => (
        <div className="font-bold text-2xl" key={currency}>
          {formatCurrency(amount, currency)}
        </div>
      ))}
    </div>
  );
}

function mergeByCurrency(
  ...groups: Array<Array<{ currency: string; amount: number }>>
): CurrencyAmount[] {
  const map = new Map<string, number>();
  for (const group of groups) {
    for (const entry of group) {
      map.set(entry.currency, (map.get(entry.currency) ?? 0) + entry.amount);
    }
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({
    currency,
    amount,
  }));
}

export function CollectionsMetrics({
  receivablesMetrics,
  payablesMetrics,
  wholesaleEnabled,
}: CollectionsMetricsProps) {
  const pendingReceivables = receivablesMetrics.byCurrency.map((b) => ({
    currency: b.currency,
    amount: b.pendingReceivables,
  }));
  const pendingPayables = payablesMetrics.byCurrency.map((b) => ({
    currency: b.currency,
    amount: b.pendingPayables,
  }));
  const collected = receivablesMetrics.byCurrency.map((b) => ({
    currency: b.currency,
    amount: b.collected,
  }));
  const overduePending = mergeByCurrency(
    wholesaleEnabled
      ? receivablesMetrics.byCurrency.map((b) => ({
          currency: b.currency,
          amount: b.overdueReceivables,
        }))
      : [],
    payablesMetrics.byCurrency.map((b) => ({
      currency: b.currency,
      amount: b.overduePayables,
    }))
  );

  return (
    <div
      className={`grid gap-4 ${
        wholesaleEnabled ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2"
      }`}
    >
      {wholesaleEnabled ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <PiggyBankIcon
                className="h-4 w-4 text-muted-foreground"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">
              Pendiente por cobrar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyAmounts values={pendingReceivables} />
            <p className="text-muted-foreground text-xs">
              Suma del saldo pendiente de CxC
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <HandCoinsIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">
            Pendiente por pagar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CurrencyAmounts values={pendingPayables} />
          <p className="text-muted-foreground text-xs">
            Suma del saldo pendiente de CxP
          </p>
        </CardContent>
      </Card>

      {wholesaleEnabled ? (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border">
              <CurrencyDollarSimpleIcon
                className="h-4 w-4 text-muted-foreground"
                weight="duotone"
              />
            </div>
            <CardTitle className="font-medium text-sm">Cobrado</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyAmounts values={collected} />
            <p className="text-muted-foreground text-xs">
              Total facturado ya cobrado
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <CalendarXIcon
              className="h-4 w-4 text-muted-foreground"
              weight="duotone"
            />
          </div>
          <CardTitle className="font-medium text-sm">Saldo vencido</CardTitle>
        </CardHeader>
        <CardContent>
          <CurrencyAmounts values={overduePending} />
          <p className="text-muted-foreground text-xs">
            {wholesaleEnabled
              ? "Pendiente con fecha vencida en CxC y CxP"
              : "Pendiente con fecha vencida en CxP"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
