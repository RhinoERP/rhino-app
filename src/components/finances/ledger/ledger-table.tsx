"use client";

import { BookOpenTextIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type LedgerRow = LedgerEntry & { running_balance: number };

const columns: ColumnDef<LedgerRow>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Fecha" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDateOnly(row.getValue("date"))}
      </span>
    ),
  },
  {
    accessorKey: "concept",
    header: "Concepto",
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-xs">{row.getValue("concept")}</span>
    ),
  },
  {
    accessorKey: "source",
    header: "Tipo",
    cell: ({ row }) => <LedgerSourceBadge source={row.getValue("source")} />,
  },
  {
    accessorKey: "debit",
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        label="Debe"
      />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number | null | undefined>("debit");
      return val != null ? (
        <span className="font-mono text-red-600">{formatCurrency(val)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "credit",
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        label="Haber"
      />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number | null | undefined>("credit");
      return val != null ? (
        <span className="font-mono text-green-600">{formatCurrency(val)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "nonCashAmount",
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        label="No monetario"
      />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number | null | undefined>("nonCashAmount");
      return val != null ? (
        <span className="font-mono text-amber-700">{formatCurrency(val)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: "running_balance",
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        label="Saldo"
      />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number>("running_balance");
      const isPositive = val >= 0;
      return (
        <span
          className={`font-mono font-semibold ${
            isPositive
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {formatCurrency(val)}
        </span>
      );
    },
  },
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

  const display = useMemo<LedgerRow[]>(() => {
    const filtered =
      activeFilter === "all"
        ? entries
        : entries.filter((e) => e.source === activeFilter);
    let balance = 0;
    return filtered.map((e) => {
      balance += (e.credit ?? 0) - (e.debit ?? 0);
      return { ...e, running_balance: balance };
    });
  }, [entries, activeFilter]);

  const table = useReactTable({
    data: display,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 25 } },
  });

  const handleExport = async () => {
    setExporting(true);
    await downloadLedgerExport(display, periodLabel);
    setExporting(false);
  };

  if (entries.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenTextIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin movimientos</EmptyTitle>
            <EmptyDescription>
              No hay movimientos financieros en el período seleccionado.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <DataTable table={table}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-1">
        <Tabs
          onValueChange={(v) => setActiveFilter(v as Filter)}
          value={activeFilter}
        >
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          disabled={exporting}
          onClick={handleExport}
          size="sm"
          variant="outline"
        >
          <DownloadSimpleIcon className="mr-1.5 size-4" weight="bold" />
          {exporting ? "Exportando..." : "Exportar"}
        </Button>
      </div>
    </DataTable>
  );
}
