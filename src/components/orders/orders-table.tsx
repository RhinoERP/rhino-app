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
import type {
  ColumnDef,
  ExpandedState,
  SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ChildOrderRoute, OrderWithDetails } from "@/modules/orders/types";
import { OrderStatusBadge } from "./order-status-badge";

type OrdersTableProps = {
  orgSlug: string;
  orders: OrderWithDetails[];
};

const ROUTE_LABEL: Record<ChildOrderRoute, string> = {
  direct: "Despacho",
  production: "Producción",
  purchase: "Compra",
};

export function OrdersTable({ orgSlug, orders }: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const childrenByParent = useMemo(() => {
    const map = new Map<string, OrderWithDetails[]>();
    for (const order of orders) {
      if (order.parent_order_id) {
        const existing = map.get(order.parent_order_id) ?? [];
        existing.push(order);
        map.set(order.parent_order_id, existing);
      }
    }
    return map;
  }, [orders]);

  const parents = useMemo(
    () => orders.filter((o) => !o.parent_order_id),
    [orders]
  );

  const columns = useMemo<ColumnDef<OrderWithDetails>[]>(
    () => [
      {
        id: "expander",
        size: 40,
        cell: ({ row }) => {
          const children = childrenByParent.get(row.original.id);
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
        accessorFn: (row) =>
          row.quotes?.customers?.fantasy_name ||
          row.quotes?.customers?.business_name ||
          "",
        size: 200,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Cliente" />
        ),
        cell: ({ row }) => {
          const customer = row.original.quotes?.customers;
          return (
            <div className="flex items-center gap-2">
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
        size: 140,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Estado" />
        ),
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      },
      {
        id: "total_amount",
        accessorFn: (row) => row.quotes?.total_amount ?? 0,
        size: 150,
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
              <CurrencyDollarIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
        size: 120,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Productos" />
        ),
        cell: ({ row }) => {
          const count = row.original.quotes?.quote_items?.length ?? 0;
          return (
            <div className="flex items-center gap-1.5">
              <HashIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
    [orgSlug, childrenByParent]
  );

  const table = useReactTable({
    data: parents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowCanExpand: (row) => {
      const children = childrenByParent.get(row.original.id);
      return !!children && children.length > 0;
    },
    globalFilterFn: "includesString",
    state: { sorting, expanded },
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <DataTable
      renderExpandedRows={({ row }) => {
        const children = childrenByParent.get(row.original.id) ?? [];
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
                  <span className="text-muted-foreground text-sm">
                    {child.order_number
                      ? ROUTE_LABEL[
                          child.order_number
                            .split("-")
                            .at(-2) as ChildOrderRoute
                        ]
                      : "—"}
                  </span>
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
        globalFilterPlaceholder="Buscar por cliente, número de pedido..."
        table={table}
      />
    </DataTable>
  );
}
