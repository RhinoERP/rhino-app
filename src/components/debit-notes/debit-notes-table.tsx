"use client";

import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { DebitNote } from "@/modules/debit-notes/types";
import { EXTENDED_INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

type DebitNotesTableProps = {
  orgSlug: string;
  debitNotes: DebitNote[];
};

function ArcaBadge({ status }: { status: DebitNote["arcaStatus"] }) {
  if (status === "authorized") {
    return (
      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 text-xs dark:text-emerald-400">
        ARCA ✓
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="text-xs" variant="destructive">
        Error ARCA
      </Badge>
    );
  }
  return null;
}

export function DebitNotesTable({ orgSlug, debitNotes }: DebitNotesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<DebitNote>[]>(
    () => [
      {
        accessorKey: "debitNoteNumber",
        header: "Número",
        cell: ({ row }) => (
          <Link
            className="font-mono text-sm hover:underline"
            href={`/org/${orgSlug}/notas-de-debito/${row.original.id}`}
          >
            {row.original.debitNoteNumber ?? row.original.id.slice(0, 8)}
          </Link>
        ),
      },
      {
        accessorKey: "issueDate",
        header: "Fecha",
        cell: ({ row }) => formatDateOnly(row.original.issueDate),
      },
      {
        accessorKey: "invoiceType",
        header: "Tipo",
        cell: ({ row }) =>
          EXTENDED_INVOICE_TYPE_LABELS[row.original.invoiceType] ??
          row.original.invoiceType,
      },
      {
        accessorKey: "customer.businessName",
        header: "Cliente",
        cell: ({ row }) =>
          row.original.customer?.fantasyName ??
          row.original.customer?.businessName ??
          "—",
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => formatCurrency(row.original.amount),
      },
      {
        accessorKey: "arcaStatus",
        header: "ARCA",
        cell: ({ row }) => <ArcaBadge status={row.original.arcaStatus} />,
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) =>
          row.original.status === "CANCELLED" ? (
            <Badge className="text-muted-foreground text-xs" variant="outline">
              Cancelada
            </Badge>
          ) : (
            <Badge className="text-xs" variant="secondary">
              Confirmada
            </Badge>
          ),
      },
    ],
    [orgSlug]
  );

  const table = useReactTable({
    data: debitNotes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });

  if (debitNotes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sin notas de débito</EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>
          Creá la primera nota de débito para esta organización.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        globalFilterPlaceholder="Buscar por número, cliente..."
        table={table}
      />
      <DataTable table={table} />
    </div>
  );
}
