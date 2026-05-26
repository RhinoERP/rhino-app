import { PlusIcon } from "@phosphor-icons/react/ssr";
import { LiquidityAlert } from "@/components/tesoreria/checks/liquidity-alert";
import { ChecksTable } from "@/components/tesoreria/checks/checks-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import {
  getIssuedChecksAction,
  getLiquidityAlertAction,
} from "@/modules/tesoreria/actions/get-issued-checks.action";
import { CheckStatusBadge } from "@/components/tesoreria/checks/check-status-badge";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function ChequesPage({ params }: Props) {
  const { orgSlug } = await params;
  const todayStr = new Date().toISOString().split("T")[0];

  const [checks, liquidityAlert] = await Promise.all([
    getIssuedChecksAction(orgSlug),
    getLiquidityAlertAction(orgSlug, todayStr),
  ]);

  const pending = checks.filter((c) => c.status === "pending");
  const overdue = checks.filter((c) => c.status === "overdue");
  const todayChecks = checks.filter(
    (c) => c.payment_date === todayStr && c.status === "pending"
  );

  const totalPending = pending.reduce((s, c) => s + c.amount, 0);
  const totalToday = todayChecks.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      {/* Alerta de liquidez diaria */}
      {liquidityAlert && <LiquidityAlert alert={liquidityAlert} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sin debitar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-amber-600">
              {formatCurrency(totalPending)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pending.length} cheques
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Acreditan hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-blue-600">
              {formatCurrency(totalToday)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {todayChecks.length} cheques — antes de las 15 hs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-red-600">
              {overdue.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Más de 30 días sin debitarse
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total cheques
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold">{checks.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              En todos los estados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {checks.length} cheques emitidos
        </p>
        <ChecksTable
          checks={checks}
          orgSlug={orgSlug}
          todayStr={todayStr}
        />
      </div>
    </div>
  );
}
