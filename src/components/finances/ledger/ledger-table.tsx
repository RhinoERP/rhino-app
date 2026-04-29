"use client";

import { BookOpenTextIcon } from "@phosphor-icons/react";
import { DownloadSimpleIcon } from "@phosphor-icons/react/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { downloadLedgerExport } from "@/lib/excel-utils";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { LedgerEntry, LedgerSource } from "@/modules/finances/types";
import { LedgerSourceBadge } from "./ledger-source-badge";

type Filter = LedgerSource | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "cobro", label: "Cobros" },
  { value: "credito_cliente", label: "Créditos" },
  { value: "pago_proveedor", label: "Pagos prov." },
  { value: "gasto_operativo", label: "Gastos" },
];

type LedgerTableProps = {
  entries: LedgerEntry[];
  periodLabel?: string;
};

export function LedgerTable({
  entries,
  periodLabel = "periodo",
}: LedgerTableProps) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState(false);

  const filtered =
    activeFilter === "all"
      ? entries
      : entries.filter((e) => e.source === activeFilter);

  let balance = 0;
  const display = filtered.map((e) => {
    balance += (e.credit ?? 0) - (e.debit ?? 0);
    return { ...e, running_balance: balance };
  });

  const handleExport = async () => {
    setExporting(true);
    await downloadLedgerExport(display, periodLabel);
    setExporting(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              className={`rounded-full px-3 py-1 font-medium text-xs transition-colors ${
                activeFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>

        {entries.length > 0 && (
          <Button
            disabled={exporting}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <DownloadSimpleIcon className="mr-1.5 size-4" weight="bold" />
            {exporting ? "Exportando..." : "Exportar"}
          </Button>
        )}
      </div>

      {display.length === 0 ? (
        <div className="rounded-md border">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenTextIcon className="size-6" weight="duotone" />
              </EmptyMedia>
              <EmptyTitle>Sin movimientos</EmptyTitle>
              <EmptyDescription>
                {activeFilter === "all"
                  ? "No hay movimientos financieros en el período seleccionado."
                  : "No hay movimientos de este tipo en el período seleccionado."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Concepto
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tipo
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Debe
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Haber
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              {display.map((entry) => {
                const isPositive = entry.running_balance >= 0;
                return (
                  <tr
                    className="border-b last:border-0 hover:bg-muted/20"
                    key={entry.id}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateOnly(entry.date)}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="line-clamp-2">{entry.concept}</span>
                    </td>
                    <td className="px-4 py-3">
                      <LedgerSourceBadge source={entry.source} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {entry.debit != null ? (
                        <span className="text-red-600">
                          {formatCurrency(entry.debit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {entry.credit != null ? (
                        <span className="text-green-600">
                          {formatCurrency(entry.credit)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold ${
                        isPositive
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {formatCurrency(entry.running_balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
