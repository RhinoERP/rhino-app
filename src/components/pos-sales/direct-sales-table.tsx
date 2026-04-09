"use client";

import { ShoppingBagIcon } from "@phosphor-icons/react";
import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import Link from "next/link";
import { useMemo } from "react";
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
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatPosPaymentMethodLabel } from "@/modules/pos/utils/payment-method";
import type { DirectSale } from "@/modules/sales/types";
import { PosSaleReturnDialog } from "./pos-sale-return-dialog";

type DirectSalesTableProps = {
  orgSlug: string;
  sales: DirectSale[];
};

const SEARCH_TERMS_SEPARATOR = /\s+/;

const normalizeSearchValue = (value: string | number | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function resolveCustomerName(sale: DirectSale): string {
  if (!sale.customer) {
    return "Consumidor final";
  }

  return sale.customer.fantasy_name || sale.customer.business_name;
}

function resolveReturnSummary(sale: DirectSale) {
  return {
    returnsCount: Math.max(0, Number(sale.returnSummary?.returnsCount ?? 0)),
    totalReturnedAmount: Math.max(
      0,
      Number(sale.returnSummary?.totalReturnedAmount ?? 0)
    ),
    totalRefundedAmount: Math.max(
      0,
      Number(sale.returnSummary?.totalRefundedAmount ?? 0)
    ),
    pendingReturnableAmount: Math.max(
      0,
      Number(
        sale.returnSummary?.pendingReturnableAmount ??
          Number(sale.total_amount ?? 0)
      )
    ),
  };
}

function getPaymentSummary(sale: DirectSale): string {
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

const directSalesGlobalFilter: FilterFn<DirectSale> = (
  row,
  _columnId,
  filterValue
) => {
  const query = normalizeSearchValue(filterValue as string | undefined);

  if (!query) {
    return true;
  }

  const searchableText = normalizeSearchValue(
    [
      resolveCustomerName(row.original),
      row.original.receipt_number,
      getPaymentSummary(row.original),
    ]
      .filter((value) => value != null)
      .join(" ")
  );

  return query
    .split(SEARCH_TERMS_SEPARATOR)
    .every((term) => searchableText.includes(term));
};

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

function createDirectSalesColumns(orgSlug: string): ColumnDef<DirectSale>[] {
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
      cell: ({ row }) => (
        <Link
          className="font-medium hover:underline"
          href={`/org/${orgSlug}/venta-directa/${row.original.id}`}
        >
          {row.original.receipt_number ?? "—"}
        </Link>
      ),
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
    {
      id: "refund_total",
      accessorFn: (row) => resolveReturnSummary(row).totalRefundedAmount,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Reintegro" />
      ),
      cell: ({ row }) => {
        const summary = resolveReturnSummary(row.original);

        return (
          <div className="text-right">
            <p className="font-medium">
              {formatCurrency(summary.totalRefundedAmount)}
            </p>
            {summary.returnsCount > 0 ? (
              <p className="text-muted-foreground text-xs">
                Saldo: {formatCurrency(summary.pendingReturnableAmount)}
              </p>
            ) : null}
          </div>
        );
      },
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <PosSaleReturnDialog orgSlug={orgSlug} sale={row.original} />
        </div>
      ),
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function DirectSalesTable({ orgSlug, sales }: DirectSalesTableProps) {
  const columns = useMemo(() => createDirectSalesColumns(orgSlug), [orgSlug]);

  const { table } = useDataTable<DirectSale>({
    data: sales,
    columns,
    pageCount: -1,
    queryKeys: {
      page: "vdPage",
      perPage: "vdPerPage",
      sort: "vdSort",
      filters: "vdFilters",
      joinOperator: "vdJoinOperator",
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
      sorting: [{ id: "sale_date", desc: true }],
    },
    globalFilterFn: directSalesGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    manualFiltering: false,
    manualPagination: false,
    manualSorting: false,
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
