import {
  BankIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CurrencyDollarIcon,
} from "@phosphor-icons/react/ssr";
import { NewMovementDialog } from "@/components/tesoreria/movements/new-movement-dialog";
import { MovementsTable } from "@/components/tesoreria/movements/movements-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { getBankAccountsAction } from "@/modules/tesoreria/actions/get-bank-accounts.action";
import { getBankMovementsAction } from "@/modules/tesoreria/actions/get-bank-movements.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function TesoreriaPage({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const sp = await searchParams;

  const currentDate = new Date();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const [movements, bankAccounts] = await Promise.all([
    getBankMovementsAction(orgSlug, { from: firstDay, to: lastDay }),
    getBankAccountsAction(orgSlug),
  ]);

  // Calcular KPIs del mes
  const totalCredits = movements
    .filter((m) => m.movement_type === "credit" || m.movement_type === "adjustment_positive")
    .reduce((sum, m) => sum + m.amount, 0);

  const totalDebits = movements
    .filter(
      (m) =>
        m.movement_type === "debit" ||
        m.movement_type === "adjustment_negative" ||
        m.movement_type === "rejected_check"
    )
    .reduce((sum, m) => sum + m.amount, 0);

  const totalBankExpenses = movements
    .filter(
      (m) =>
        (m.movement_type === "debit" || m.movement_type === "adjustment_negative") &&
        m.accounting_account_code === "5.1.01"
    )
    .reduce((sum, m) => sum + m.amount, 0);

  const netBalance = totalCredits - totalDebits;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BankIcon className="size-4" weight="duotone" />
              Saldo neto del mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`font-mono text-2xl font-bold ${
                netBalance >= 0 ? "text-green-700" : "text-red-600"
              }`}
            >
              {netBalance >= 0 ? "+" : ""}
              {formatCurrency(netBalance)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Este mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowUpIcon className="size-4 text-green-600" weight="bold" />
              Créditos del mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-green-700">
              {formatCurrency(totalCredits)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {movements.filter(
                (m) =>
                  m.movement_type === "credit" ||
                  m.movement_type === "adjustment_positive"
              ).length}{" "}
              movimientos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowDownIcon className="size-4 text-red-500" weight="bold" />
              Débitos del mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-red-600">
              {formatCurrency(totalDebits)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {movements.filter(
                (m) =>
                  m.movement_type === "debit" ||
                  m.movement_type === "adjustment_negative" ||
                  m.movement_type === "rejected_check"
              ).length}{" "}
              movimientos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CurrencyDollarIcon className="size-4 text-amber-500" weight="duotone" />
              Gastos bancarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-amber-600">
              {formatCurrency(totalBankExpenses)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Retenciones e impuestos bancarios
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla + acción */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {movements.length} movimientos este mes
          </p>
          <NewMovementDialog bankAccounts={bankAccounts} orgSlug={orgSlug} />
        </div>

        <MovementsTable movements={movements} />
      </div>
    </div>
  );
}
