import {
  CalendarXIcon,
  CurrencyDollarSimpleIcon,
  HandCoinsIcon,
  PiggyBankIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type {
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";

type CollectionsMetricsProps = {
  receivables: ReceivableAccount[];
  payables: PayableAccount[];
  wholesaleEnabled: boolean;
};

const toDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function CollectionsMetrics({
  receivables,
  payables,
  wholesaleEnabled,
}: CollectionsMetricsProps) {
  const pendingReceivables = receivables.reduce(
    (sum, account) => sum + (account.pending_balance ?? 0),
    0
  );

  const pendingPayables = payables.reduce(
    (sum, account) => sum + (account.pending_balance ?? 0),
    0
  );

  const collected = receivables.reduce(
    (sum, account) =>
      sum + Math.max(0, (account.total_amount ?? 0) - account.pending_balance),
    0
  );

  const today = new Date();
  const overdueReceivables = receivables
    .filter((account) => {
      const due = toDate(account.due_date);
      return (
        account.pending_balance > 0 &&
        due !== null &&
        due.getTime() < today.getTime()
      );
    })
    .reduce((sum, account) => sum + account.pending_balance, 0);
  const overduePayables = payables
    .filter((account) => {
      const due = toDate(account.due_date);
      return (
        account.pending_balance > 0 &&
        due !== null &&
        due.getTime() < today.getTime()
      );
    })
    .reduce((sum, account) => sum + account.pending_balance, 0);
  const overduePending =
    (wholesaleEnabled ? overdueReceivables : 0) + overduePayables;

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
              {formatCurrency(pendingReceivables)}
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
            {formatCurrency(pendingPayables)}
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
              {formatCurrency(collected)}
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
