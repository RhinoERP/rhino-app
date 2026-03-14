"use client";

import { ShoppingBagIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PosSale } from "@/modules/pos/types";
import { formatPosPaymentMethodLabel } from "@/modules/pos/utils/payment-method";

type DirectSalesTableProps = {
  orgSlug: string;
  sales: PosSale[];
};

function resolveCustomerName(sale: PosSale): string {
  if (!sale.customer) {
    return "Consumidor final";
  }

  return sale.customer.fantasy_name || sale.customer.business_name;
}

function getPaymentSummary(sale: PosSale): string {
  if (!sale.payments.length) {
    return "Sin pago";
  }

  const uniqueMethods = Array.from(
    new Set(
      sale.payments.map((payment) =>
        formatPosPaymentMethodLabel(String(payment.payment_method))
      )
    )
  );

  return uniqueMethods.join(", ");
}

function getSaleStatusLabel(status: string | null): {
  label: string;
  className: string;
} {
  const normalized = status?.toUpperCase().trim() ?? "COMPLETED";

  if (normalized === "COMPLETED") {
    return {
      label: "Completada",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (normalized === "CANCELLED") {
    return {
      label: "Cancelada",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }

  return {
    label: normalized,
    className: "bg-muted text-muted-foreground border-muted",
  };
}

function createDirectSalesColumns(): ColumnDef<PosSale>[] {
  return [
    {
      id: "sale_date",
      accessorKey: "sale_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha" />
      ),
      cell: ({ row }) => {
        const date = row.original.sale_date;

        if (!date) {
          return "—";
        }

        return formatDate(date, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      },
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "customer",
      accessorFn: (row) => resolveCustomerName(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "receipt_number",
      accessorFn: (row) => row.receipt_number ?? "—",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Comprobante" />
      ),
      cell: ({ row }) => row.original.receipt_number ?? "—",
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "items",
      accessorFn: (row) => row.items.length,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Ítems" />
      ),
      cell: ({ row }) => {
        const count = row.original.items.length;
        return `${count} ${count === 1 ? "ítem" : "ítems"}`;
      },
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "payment_method",
      accessorFn: (row) => getPaymentSummary(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Pago" />
      ),
      cell: ({ row }) => getPaymentSummary(row.original),
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "status",
      accessorFn: (row) => row.status ?? "COMPLETED",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const status = getSaleStatusLabel(row.original.status);

        return (
          <Badge className={status.className} variant="outline">
            {status.label}
          </Badge>
        );
      },
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "total",
      accessorFn: (row) => Number(row.total_amount ?? 0),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Total" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(Number(row.original.total_amount ?? 0))}
        </div>
      ),
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
  ];
}

export function DirectSalesTable({ orgSlug, sales }: DirectSalesTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");
  const columns = useMemo(() => createDirectSalesColumns(), []);

  const table = useReactTable<PosSale>({
    data: sales,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (sales.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBagIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay ventas directas registradas</EmptyTitle>
            <EmptyDescription>
              Crea la primera venta directa para empezar a cobrar en el momento.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={`/org/${orgSlug}/venta-directa/nueva`}>
                Nueva venta directa
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading text-xl">Ventas directas</h2>
        <p className="text-muted-foreground text-sm">
          Operaciones de mostrador cobradas en el momento.
        </p>
      </div>
      <DataTable table={table}>
        <DataTableToolbar
          globalFilterPlaceholder="Buscar cliente, comprobante o pago..."
          table={table}
        />
      </DataTable>
    </div>
  );
}
