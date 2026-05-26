"use client";

import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { BankMovement, BankMovementType } from "@/modules/tesoreria/types";
import { MovementTypeBadge } from "./movement-type-badge";

type Filter = BankMovementType | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "credit", label: "Créditos" },
  { value: "debit", label: "Débitos" },
  { value: "adjustment_positive", label: "Ajustes +" },
  { value: "adjustment_negative", label: "Ajustes -" },
  { value: "rejected_check", label: "Ch. rechazados" },
];

const columns: ColumnDef<BankMovement>[] = [
  {
    accessorKey: "movement_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Fecha" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDateOnly(row.getValue("movement_date"))}
      </span>
    ),
  },
  {
    accessorKey: "movement_type",
    header: "Tipo",
    cell: ({ row }) => (
      <MovementTypeBadge type={row.getValue("movement_type")} />
    ),
  },
  {
    accessorKey: "concept",
    header: "Concepto",
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-xs font-medium">
        {row.getValue("concept")}
      </span>
    ),
  },
  {
    accessorKey: "bank_account",
    header: "Cuenta bancaria",
    cell: ({ row }) => {
      const acc = row.getValue<{ name: string } | null>("bank_account");
      return (
        <span className="text-muted-foreground text-sm">
          {acc?.name ?? "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "accounting_account_code",
    header: "Cta. contable",
    cell: ({ row }) => {
      const code = row.getValue<string | null>("accounting_account_code");
      const name = row.original.accounting_account_name;
      if (!code) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="font-mono text-xs">
          {code}
          {name ? ` — ${name}` : ""}
        </span>
      );
    },
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        label="Importe"
      />
    ),
    cell: ({ row }) => {
      const type = row.original.movement_type;
      const amount = row.getValue<number>("amount");
      const isDebit = type === "debit" || type === "adjustment_negative" || type === "rejected_check";
      return (
        <span
          className={`font-mono font-semibold ${
            isDebit ? "text-red-600" : "text-green-700"
          }`}
        >
          {isDebit ? "-" : "+"}
          {formatCurrency(amount)}
        </span>
      );
    },
  },
];

type Props = { movements: BankMovement[] };

export function MovementsTable({ movements }: Props) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const filtered =
    activeFilter === "all"
      ? movements
      : movements.filter((m) => m.movement_type === activeFilter);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <DataTable table={table}>
      <div className="p-1">
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
      </div>
    </DataTable>
  );
}
