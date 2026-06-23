"use client";

import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  PaperPlaneTiltIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type {
  ColumnDef,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Calendar, DollarSign, Hash, User } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuoteWithCustomer } from "@/modules/quotes/actions/get-quotes.action";
import type { QuoteStatus } from "@/modules/quotes/types";
import { QuoteActionsCell } from "./quote-actions-cell";

type QuotesTableProps = {
  orgSlug: string;
  quotes: QuoteWithCustomer[];
};

export const statusStyles: Record<
  QuoteStatus,
  {
    label: string;
    icon: typeof ClipboardTextIcon;
    className: string;
  }
> = {
  DRAFT: {
    label: "Borrador",
    icon: ClipboardTextIcon,
    className:
      "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/5",
  },
  SENT: {
    label: "Enviado",
    icon: PaperPlaneTiltIcon,
    className:
      "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400 dark:bg-blue-500/5",
  },
  APPROVED: {
    label: "Aprobado",
    icon: CheckCircleIcon,
    className:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-500/5",
  },
  REJECTED: {
    label: "Rechazado",
    icon: XCircleIcon,
    className:
      "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400 dark:bg-rose-500/5",
  },
  CONVERTED: {
    label: "Convertido",
    icon: ArrowSquareOutIcon,
    className:
      "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400 dark:bg-violet-500/5",
  },
};

export function QuotesTable({ orgSlug, quotes }: QuotesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const handleRowClick = useCallback(
    (quoteId: string) => {
      window.location.href = `/org/${orgSlug}/presupuestos/${quoteId}/editar`;
    },
    [orgSlug]
  );

  const columns = useMemo<ColumnDef<QuoteWithCustomer>[]>(
    () => [
      {
        id: "customer",
        accessorFn: (row) =>
          row.customers?.fantasy_name || row.customers?.business_name || "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cliente" />
        ),
        size: 260,
        cell: ({ row }) => {
          const quote = row.original;
          const displayName =
            quote.customers?.fantasy_name ||
            quote.customers?.business_name ||
            "Cliente desconocido";

          return (
            <span className="block font-medium text-sm">{displayName}</span>
          );
        },
        meta: {
          label: "Cliente",
          variant: "text",
          icon: User,
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        size: 140,
        cell: ({ row }) => {
          const dateStr = row.original.created_at;
          if (!dateStr) {
            return <span className="text-muted-foreground text-sm">—</span>;
          }
          return (
            <div className="text-muted-foreground text-sm">
              {formatDate(dateStr, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          );
        },
        meta: {
          label: "Fecha",
          variant: "dateRange",
          icon: Calendar,
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "items_count",
        accessorFn: (row) =>
          (row.quote_items ?? []).reduce(
            (sum, item) => sum + (item.quantity ?? 0),
            0
          ),
        header: ({ column }) => (
          <DataTableColumnHeader
            className="ml-auto justify-end text-right"
            column={column}
            label="Artículos"
          />
        ),
        size: 110,
        cell: ({ row }) => {
          const itemsCount = (row.original.quote_items ?? []).reduce(
            (sum, item) => sum + (item.quantity ?? 0),
            0
          );
          return (
            <div className="pr-2 text-right font-medium text-sm">
              <span className="font-semibold text-foreground">
                {itemsCount}
              </span>{" "}
              <span className="text-muted-foreground text-xs">
                {itemsCount === 1 ? "unidad" : "unidades"}
              </span>
            </div>
          );
        },
        meta: {
          label: "Artículos",
          variant: "number",
          icon: Hash,
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "total_amount",
        accessorKey: "total_amount",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="ml-auto justify-end"
            column={column}
            label="Total"
          />
        ),
        size: 140,
        cell: ({ row }) => {
          const amount = row.original.total_amount;
          const currency = row.original.currency;
          return (
            <div className="text-right font-semibold text-sm">
              {formatCurrency(amount, currency)}
            </div>
          );
        },
        meta: {
          label: "Total",
          variant: "text",
          icon: DollarSign,
        },
        enableColumnFilter: false,
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Estado" />
        ),
        size: 150,
        cell: ({ row }) => {
          const status = row.original.status;
          const statusInfo = statusStyles[status] ?? {
            label: status,
            icon: ClipboardTextIcon,
            className: "bg-muted text-muted-foreground border-transparent",
          };
          const Icon = statusInfo.icon;

          return (
            <Badge
              className={cn(
                "gap-1.5 rounded-full border px-2.5 py-0.5 font-medium text-xs shadow-none",
                statusInfo.className
              )}
              variant="outline"
            >
              <Icon className="h-3.5 w-3.5" weight="duotone" />
              {statusInfo.label}
            </Badge>
          );
        },
        meta: {
          label: "Estado",
          variant: "multiSelect",
          options: Object.entries(statusStyles).map(([value, info]) => ({
            label: info.label,
            value: value as QuoteStatus,
            icon: info.icon,
          })),
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
        filterFn: (row, id, value) => {
          const filterValues = Array.isArray(value) ? value : [value];
          return filterValues.includes(row.getValue(id));
        },
      },
      {
        id: "actions",
        size: 320,
        cell: ({ row }) => {
          const quote = row.original;
          const displayName =
            quote.customers?.fantasy_name ||
            quote.customers?.business_name ||
            "Cliente desconocido";
          return (
            <QuoteActionsCell
              createdAt={quote.created_at}
              customerEmail={quote.customers?.email ?? null}
              customerName={displayName}
              orgSlug={orgSlug}
              quoteId={quote.id}
              status={quote.status}
            />
          );
        },
      },
    ],
    [orgSlug]
  );

  const table = useReactTable<QuoteWithCustomer>({
    data: quotes,
    columns,
    state: {
      globalFilter,
      sorting,
      rowSelection,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar
        globalFilterPlaceholder="Buscar presupuestos..."
        table={table}
      />
      <DataTable
        fixedHeight={true}
        onRowClick={(row) => handleRowClick(row.original.id)}
        table={table}
      />
    </div>
  );
}
