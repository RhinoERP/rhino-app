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

export function CollectionsMetrics({
  receivablesMetrics,
  payablesMetrics,
  wholesaleEnabled,
}: CollectionsMetricsProps) {
  const overduePending =
    (wholesaleEnabled ? receivablesMetrics.overdueReceivables : 0) +
    payablesMetrics.overduePayables;

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
            <div className="font-bold text-2xl">
              {formatCurrency(receivablesMetrics.pendingReceivables)}
            </div>
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
          <div className="font-bold text-2xl">
            {formatCurrency(payablesMetrics.pendingPayables)}
          </div>
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
            <div className="font-bold text-2xl">
              {formatCurrency(receivablesMetrics.collected)}
            </div>
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
          <div className="font-bold text-2xl">
            {formatCurrency(overduePending)}
          </div>
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
