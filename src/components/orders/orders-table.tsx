"use client";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowRight, Calendar, DollarSign, Hash, User } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type OrdersTableProps = {
  orgSlug: string;
  orders: OrderWithDetails[];
};

export function OrdersTable({ orgSlug, orders }: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  const columns = useMemo<ColumnDef<OrderWithDetails>[]>(
    () => [
      {
        id: "order_number",
        accessorKey: "order_number",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="N° Pedido" />
        ),
        cell: ({ row }) => (
          <span className="font-mono font-semibold text-sm">
            {row.original.order_number}
          </span>
        ),
      },
      {
        id: "customer",
        accessorFn: (row) =>
          row.quotes?.customers?.fantasy_name ||
          row.quotes?.customers?.business_name ||
          "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cliente" />
        ),
        cell: ({ row }) => {
          const customer = row.original.quotes?.customers;
          return (
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-sm">
                {customer?.fantasy_name || customer?.business_name || "—"}
              </span>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Estado" />
        ),
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      },
      {
        id: "total_amount",
        accessorFn: (row) => row.quotes?.total_amount ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Monto" />
        ),
        cell: ({ row }) => {
          const quote = row.original.quotes;
          if (!quote) {
            return "—";
          }
          return (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-sm">
                {formatCurrency(quote.total_amount, quote.currency)}
              </span>
            </div>
          );
        },
      },
      {
        id: "items",
        accessorFn: (row) => row.quotes?.quote_items?.length ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Productos" />
        ),
        cell: ({ row }) => {
          const count = row.original.quotes?.quote_items?.length ?? 0;
          return (
            <div className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">
                {count} ítem{count !== 1 ? "s" : ""}
              </span>
            </div>
          );
        },
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
              {formatDate(row.original.created_at ?? "")}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/org/${orgSlug}/pedidos/${row.original.id}`}>
                Ver detalle
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [orgSlug]
  );

  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    globalFilterFn: "includesString",
    state: { sorting },
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar
        globalFilterPlaceholder="Buscar por cliente, número de pedido..."
        table={table}
      />
      <DataTable table={table} />
    </div>
  );
}
