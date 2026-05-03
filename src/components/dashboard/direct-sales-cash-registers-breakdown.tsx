"use client";

import { CashRegisterIcon } from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DirectSalesCashRegisterBreakdown } from "@/types/dashboard";

type DirectSalesCashRegistersBreakdownProps = {
  data: DirectSalesCashRegisterBreakdown[];
};

export function DirectSalesCashRegistersBreakdown({
  data,
}: DirectSalesCashRegistersBreakdownProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalle de Cajas</CardTitle>
        <CardDescription>
          Sesiones POS y fondos asociados al periodo
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="space-y-3">
            {data.map((register) => (
              <div
                className="grid gap-4 rounded-md border p-4 lg:grid-cols-[minmax(190px,0.7fr)_minmax(0,2fr)]"
                key={register.sessionId}
              >
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border">
                      <CashRegisterIcon
                        className="h-5 w-5 text-muted-foreground"
                        weight="duotone"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-base leading-tight">
                        {register.terminalName}
                      </p>
                      <p className="mt-1 text-muted-foreground text-sm leading-snug">
                        {formatRegisterLabel(register)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "rounded-md border px-3 py-1.5 font-medium text-sm",
                        register.status === "OPEN"
                          ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/20"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {register.status === "OPEN" ? "Abierta" : "Cerrada"}
                    </span>
                    {register.openedAt && (
                      <span className="rounded-md border px-3 py-1.5 text-muted-foreground text-sm">
                        {formatDate(register.openedAt, {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr))]">
                  <RegisterMetric
                    label="Total vendido"
                    value={formatCurrency(register.totalSales)}
                  />
                  <RegisterMetric
                    label="Efectivo"
                    value={formatCurrency(register.cashAmount)}
                  />
                  <RegisterMetric
                    label="Total cobrado"
                    value={formatCurrency(register.paymentAmount)}
                  />
                  <RegisterMetric
                    label="Operaciones"
                    value={String(register.salesCount)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-center">
            <p className="text-muted-foreground text-sm">
              No hay sesiones de caja con venta directa para el periodo
              seleccionado
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegisterMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/35 px-3 py-3">
      <p className="text-muted-foreground text-xs leading-tight">{label}</p>
      <p
        className={cn(
          "mt-1 max-w-full whitespace-normal break-words font-semibold tabular-nums leading-tight",
          getMetricValueClassName(value)
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function getMetricValueClassName(value: string) {
  const length = value.replace(/\s/g, "").length;

  if (length >= 16) {
    return "text-xs";
  }

  if (length >= 12) {
    return "text-[13px]";
  }

  return "text-sm xl:text-base";
}

function formatRegisterLabel(register: DirectSalesCashRegisterBreakdown) {
  const sessionLabel = `${register.sessionCount} ${
    register.sessionCount === 1 ? "sesión" : "sesiones"
  } en el periodo`;
  const parts = [
    register.terminalCode ? `Código ${register.terminalCode}` : null,
    register.cashRegisterNumber ? `Caja ${register.cashRegisterNumber}` : null,
  ].filter(Boolean);

  return parts.length > 0
    ? `${parts.join(" - ")} · ${sessionLabel}`
    : sessionLabel;
}
