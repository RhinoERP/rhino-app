"use client";

import {
  CalendarIcon,
  CaretDown,
  CaretRight,
  CaretRightIcon,
  CurrencyDollarIcon,
  HashIcon,
  MagnifyingGlassIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { OrdersExportButton } from "@/components/orders/orders-export-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withOptions({ shallow: false }).withDefault("")
  );

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
          <Link
            className="font-mono font-semibold text-sm hover:underline"
            href={`/org/${orgSlug}/pedidos/${row.original.id}`}
          >
            {row.original.order_number}
          </Link>
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
                  <Link
                    className="font-medium font-mono text-sm hover:underline"
                    href={`/org/${orgSlug}/pedidos/${child.id}`}
                  >
                    {child.order_number}
                  </Link>
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
        searchSlot={
          <>
            <div className="relative">
              <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-8 w-48 pl-8 lg:w-72"
                onChange={(event) => {
                  setSearch(event.target.value || null);
                  table.setPageIndex(0);
                }}
                placeholder="Buscar por número de pedido..."
                value={search}
              />
            </div>
            {search && (
              <Button
                aria-label="Limpiar busqueda"
                className="border-dashed"
                onClick={() => {
                  setSearch(null);
                  table.setPageIndex(0);
                }}
                size="sm"
                variant="outline"
              >
                <XIcon />
                Limpiar
              </Button>
            )}
          </>
        }
        table={table}
      >
        <OrdersExportButton orgSlug={orgSlug} table={table} />
      </DataTableToolbar>
    </DataTable>
  );
}
