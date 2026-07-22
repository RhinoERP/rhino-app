"use client";

import {
  CalendarIcon,
  CaretDown,
  CaretRight,
  CaretRightIcon,
  CurrencyDollarIcon,
  HashIcon,
  UserIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { OrdersExportButton } from "@/components/orders/orders-export-button";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OrderPaginatedItem } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type OrdersTableProps = {
  orgSlug: string;
  initialData: OrderPaginatedItem[];
  pageCount: number;
};

export function OrdersTable({
  orgSlug,
  initialData,
  pageCount,
}: OrdersTableProps) {
  const columns = useMemo<ColumnDef<OrderPaginatedItem>[]>(
    () => [
      {
        id: "expander",
        size: 40,
        cell: ({ row }) => {
          const children = row.original.children;
          if (!children || children.length === 0) {
            return null;
          }
          return (
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                row.toggleExpanded();
              }}
              type="button"
            >
              {row.getIsExpanded() ? (
                <CaretDown className="h-4 w-4" />
              ) : (
                <CaretRight className="h-4 w-4" />
              )}
            </button>
          );
        },
      },
      {
        id: "order_number",
        accessorKey: "order_number",
        size: 180,
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
        accessorKey: "customer_name",
        size: 200,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cliente" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-sm">
              {row.original.customer_name || "—"}
            </span>
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        size: 140,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Estado" />
        ),
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      },
      {
        id: "total_amount",
        size: 150,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Monto" />
        ),
        cell: ({ row }) => {
          if (!row.original.total_amount && row.original.total_amount !== 0) {
            return "—";
          }
          return (
            <div className="flex items-center gap-1.5">
              <CurrencyDollarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-sm">
                {formatCurrency(
                  row.original.total_amount,
                  row.original.currency
                )}
              </span>
            </div>
          );
        },
      },
      {
        id: "items_count",
        accessorKey: "items_count",
        size: 120,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Productos" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <HashIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">
              {row.original.items_count} ítem
              {row.original.items_count !== 1 ? "s" : ""}
            </span>
          </div>
        ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        size: 130,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Fecha" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
              {formatDate(row.original.created_at ?? "")}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        size: 140,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/org/${orgSlug}/pedidos/${row.original.id}`}>
                Ver detalle
                <CaretRightIcon className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [orgSlug]
  );

  const { table } = useDataTable<OrderPaginatedItem>({
    data: initialData,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    getRowCanExpand: (row) => row.original.children.length > 0,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    shallow: false,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
    },
  });

  return (
    <DataTable
      renderExpandedRows={({ row }) => {
        const children = row.original.children;
        return (
          <>
            {children.map((child) => (
              <TableRow className="hover:bg-muted/50" key={child.id}>
                <TableCell className="pl-14" />
                <TableCell>
                  <span className="font-medium font-mono text-sm">
                    {child.order_number}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-sm">—</span>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={child.status} />
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell>
                  <div className="flex justify-end">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/org/${orgSlug}/pedidos/${child.id}`}>
                        Ver detalle
                        <CaretRightIcon className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </>
        );
      }}
      table={table}
      tableFixed
    >
      <DataTableToolbar
        globalFilterPlaceholder="Buscar por número de pedido..."
        table={table}
        useGlobalFilters={false}
      >
        <OrdersExportButton orgSlug={orgSlug} table={table} />
      </DataTableToolbar>
    </DataTable>
  );
}
