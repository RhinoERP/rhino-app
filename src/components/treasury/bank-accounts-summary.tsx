"use client";

import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { useCuentasBancarias } from "@/modules/treasury/queries/queries.client";

type Props = {
  orgId: string;
};

export function BankAccountsSummary({ orgId }: Props) {
  const { data: cuentas = [], isLoading } = useCuentasBancarias(orgId, {
    soloActivas: true,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            className="h-24 animate-pulse rounded-lg border bg-muted/30"
            key={i}
          />
        ))}
      </div>
    );
  }

  if (cuentas.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay cuentas bancarias activas configuradas.
      </p>
    );
  }

  const totalARS = cuentas
    .filter((c) => c.moneda === "ARS")
    .reduce((sum, c) => sum + Number(c.saldo_operativo), 0);
  const totalUSD = cuentas
    .filter((c) => c.moneda === "USD")
    .reduce((sum, c) => sum + Number(c.saldo_operativo), 0);

  return (
    <div className="space-y-4">
      {/* Totales */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-muted-foreground text-xs">Total ARS</p>
          <p className="mt-1 font-bold text-2xl">{formatCurrency(totalARS)}</p>
        </div>
        {totalUSD > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground text-xs">Total USD</p>
            <p className="mt-1 font-bold text-2xl">
              {formatCurrency(totalUSD, "USD")}
            </p>
          </div>
        )}
      </div>

      {/* Cards individuales */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cuentas.map((cuenta) => (
          <div
            className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
            key={cuenta.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{cuenta.nombre}</p>
                <p className="text-muted-foreground text-xs">{cuenta.banco}</p>
              </div>
              <Badge className="shrink-0 text-xs" variant="outline">
                {cuenta.moneda}
              </Badge>
            </div>
            <p className="mt-3 font-semibold text-xl">
              {formatCurrency(Number(cuenta.saldo_operativo))}
            </p>
            {cuenta.numero_cuenta && (
              <p className="mt-1 font-mono text-muted-foreground text-xs">
                {cuenta.numero_cuenta}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
