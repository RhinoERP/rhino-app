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
                className="grid gap-4 rounded-md border p-4 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]"
                key={register.sessionId}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border">
                      <CashRegisterIcon
                        className="h-4 w-4 text-muted-foreground"
                        weight="duotone"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {register.terminalName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatRegisterLabel(register)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 font-medium text-xs",
                        register.status === "OPEN"
                          ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/20"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {register.status === "OPEN" ? "Abierta" : "Cerrada"}
                    </span>
                    {register.openedAt && (
                      <span className="rounded-md border px-2 py-1 text-muted-foreground text-xs">
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
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-semibold text-sm">{value}</p>
    </div>
  );
}

function formatRegisterLabel(register: DirectSalesCashRegisterBreakdown) {
  const parts = [
    register.terminalCode ? `Código ${register.terminalCode}` : null,
    register.cashRegisterNumber ? `Caja ${register.cashRegisterNumber}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : "Sin identificación de caja";
}
