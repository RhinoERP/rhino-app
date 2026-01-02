"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  HashIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, DollarSign, Receipt, User } from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import { createSalesActionsColumn } from "./sale-columns-shared";

export const statusLabels: Record<
  SalesOrderWithCustomer["status"],
  {
    label: string;
    icon: typeof ClipboardTextIcon;
    iconColor: string;
  }
> = {
  DRAFT: {
    label: "Preventa",
    icon: ClipboardTextIcon,
    iconColor: "text-amber-500",
  },
  CONFIRMED: {
    label: "Confirmada",
    icon: CheckCircleIcon,
    iconColor: "text-blue-500",
  },
  DISPATCH: {
    label: "Despachada",
    icon: TruckIcon,
    iconColor: "text-orange-500",
  },
  DELIVERED: {
    label: "Entregada",
    icon: CheckCircleIcon,
    iconColor: "text-green-500",
  },
  CANCELLED: {
    label: "Cancelada",
    icon: XCircleIcon,
    iconColor: "text-red-500",
  },
};

export const invoiceTypeLabels: Record<InvoiceType, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  NOTA_DE_VENTA: "Nota de venta",
};

export function getCustomerDisplayName(sale: SalesOrderWithCustomer): string {
  return (
    sale.customer?.fantasy_name ||
    sale.customer?.business_name ||
    "Cliente desconocido"
  );
}

function parseDateString(dateString?: string | null): number | null {
  if (!dateString) {
    return null;
  }

  const [year, month, day] = dateString.split("T")[0].split("-").map(Number);
  if (
    !(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))
  ) {
    return null;
  }

  const timestamp = new Date(year, month - 1, day).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseFilterTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return parseFilterTimestamp(value[0]);
  }

  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isEmptyDateRangeFilterValue(value: unknown): boolean {
  if (!value) {
    return true;
  }

  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => !item);
}

export function createSalesColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = [],
  sellerOptions: Array<{ label: string; value: string }> = [],
  includeStatusFilter = true
): ColumnDef<SalesOrderWithCustomer>[] {
  const filterByDateRange = (
    dateString: string | null | undefined,
    value: unknown
  ) => {
    const target = parseDateString(dateString);
    if (target === null) {
      return false;
    }

    if (isEmptyDateRangeFilterValue(value)) {
      return true;
    }

    const [from, to] = Array.isArray(value) ? value : [value, undefined];
    const fromTs = parseFilterTimestamp(from);
    const toTs = parseFilterTimestamp(to);

    if (fromTs !== null && toTs !== null) {
      return target >= fromTs && target <= toTs;
    }

    if (fromTs !== null) {
      return target >= fromTs;
    }

    if (toTs !== null) {
      return target <= toTs;
    }

    return true;
  };

  return [
    {
      id: "sale_number",
      accessorFn: (row) => row.sale_number ?? row.invoice_number ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="N° Venta" />
      ),
      cell: ({ row }) => {
        const sale = row.original;
        const saleNumber = sale.sale_number ?? sale.invoice_number;

        if (!saleNumber) {
          return <div className="font-medium text-sm">—</div>;
        }

        return (
          <Link
            className="block font-mono text-sm transition-colors hover:text-blue-600"
            href={`/org/${orgSlug}/ventas/${sale.id}`}
          >
            {saleNumber}
          </Link>
        );
      },
      meta: {
        label: "N° Venta",
        variant: "text",
        icon: HashIcon,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "customer",
      accessorKey: "customer.business_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => {
        const sale = row.original;
        const displayName = getCustomerDisplayName(sale);

        return (
          <Link
            className="block transition-colors hover:text-blue-600"
            href={`/org/${orgSlug}/ventas/${sale.id}`}
          >
            <div className="font-medium">{displayName}</div>
          </Link>
        );
      },
      meta: {
        label: "Cliente",
        variant: "multiSelect",
        options: customerOptions,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
      filterFn: (row, _id, value) => {
        const customer = row.original.customer;
        if (!customer) {
          return false;
        }
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(customer.id);
      },
    },
    {
      id: "seller",
      accessorFn: (row) => row.seller?.name || row.seller?.email || "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vendedor" />
      ),
      cell: ({ row }) => {
        const seller = row.original.seller;
        const label = seller?.name || seller?.email || "—";

        return <div className="text-sm">{label}</div>;
      },
      meta: {
        label: "Vendedor",
        variant: "multiSelect",
        options: sellerOptions,
        icon: User,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.user_id);
      },
    },
    {
      id: "sale_date",
      accessorKey: "sale_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha" />
      ),
      cell: ({ row }) => {
        const date = row.original.sale_date;
        return <div className="text-sm">{formatDateOnly(date)}</div>;
      },
      meta: {
        label: "Creación en",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.sale_date, value),
    },
    {
      id: "expiration_date",
      accessorKey: "expiration_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vencimiento" />
      ),
      cell: ({ row }) => {
        const date = row.original.expiration_date;
        return (
          <div className="text-sm">{date ? formatDateOnly(date) : "—"}</div>
        );
      },
      meta: {
        label: "Vencimiento",
        variant: "date",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const filterTimestamp = parseFilterTimestamp(value);
        if (filterTimestamp === null) {
          return true;
        }

        const expirationDate = parseDateString(row.original.expiration_date);
        if (expirationDate === null) {
          return false;
        }

        return expirationDate <= filterTimestamp;
      },
    },
    {
      id: "invoice_type",
      accessorKey: "invoice_type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Comprobante" />
      ),
      cell: ({ row }) => {
        const invoiceType = row.original.invoice_type;
        return <div className="text-sm">{invoiceTypeLabels[invoiceType]}</div>;
      },
      meta: {
        label: "Comprobante",
        variant: "multiSelect",
        options: (Object.keys(invoiceTypeLabels) as InvoiceType[]).map(
          (key) => ({
            label: invoiceTypeLabels[key],
            value: key,
          })
        ),
        icon: Receipt,
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: true,
      filterFn: (row, id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.getValue(id));
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const status = row.original.status as SalesOrderStatus;
        const statusInfo = statusLabels[status];
        const Icon = statusInfo.icon;

        return (
          <Badge className="gap-1.5 rounded-full" variant="outline">
            <Icon
              className={`h-3.5 w-3.5 ${statusInfo.iconColor}`}
              weight="duotone"
            />
            {statusInfo.label}
          </Badge>
        );
      },
      meta: includeStatusFilter
        ? {
            label: "Estado",
            variant: "multiSelect",
            options: Object.entries(statusLabels).map(([value, info]) => ({
              label: info.label,
              value: value as SalesOrderStatus,
              icon: info.icon,
            })),
          }
        : undefined,
      enableColumnFilter: includeStatusFilter,
      enableSorting: false,
      enableHiding: false,
      filterFn: includeStatusFilter
        ? (row, id, value) => {
            const filterValues = Array.isArray(value) ? value : [value];
            return filterValues.includes(row.getValue(id));
          }
        : undefined,
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
      cell: ({ row }) => {
        const amount = row.original.total_amount;
        return (
          <div className="text-right font-semibold">
            {formatCurrency(amount)}
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
      enableHiding: true,
    },
    createSalesActionsColumn(orgSlug),
  ];
}
