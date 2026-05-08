"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  DollarSign,
  FileDigit,
  Hash,
  Receipt,
  Ticket,
  User,
} from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { formatDateTime } from "@/lib/utils";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import { ArcaInvoiceDownloadButton } from "./arca-invoice-download-button";
import { ArcaInvoicePreviewButton } from "./arca-invoice-preview-button";

const invoiceTypeLabels: Record<InvoiceType, string> = INVOICE_TYPE_LABELS;

const saleStatusLabels: Record<SalesOrderStatus, string> = {
  DRAFT: "Preventa",
  CONFIRMED: "Confirmada",
  DISPATCH: "Despachada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
};

function getCustomerDisplayName(invoice: SalesOrderWithCustomer): string {
  return (
    invoice.customer?.fantasy_name ||
    invoice.customer?.business_name ||
    "Cliente desconocido"
  );
}

function parseDateOnly(dateString?: string | null): number | null {
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

function parseTimestamp(dateString?: string | null): number | null {
  if (!dateString) {
    return null;
  }

  const timestamp = new Date(dateString).getTime();
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

function formatArcaPointAndVoucher(invoice: SalesOrderWithCustomer): string {
  if (!(invoice.arca_point_of_sale && invoice.arca_voucher_number)) {
    return "—";
  }

  return `${String(invoice.arca_point_of_sale).padStart(4, "0")} / ${String(
    invoice.arca_voucher_number
  ).padStart(8, "0")}`;
}

export function createArcaInvoiceColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = [],
  sellerOptions: Array<{ label: string; value: string }> = []
): ColumnDef<SalesOrderWithCustomer>[] {
  const filterByDateRange = (
    dateString: string | null | undefined,
    parser: (dateValue: string | null | undefined) => number | null,
    filterValue: unknown
  ) => {
    const target = parser(dateString);
    if (target === null) {
      return false;
    }

    if (isEmptyDateRangeFilterValue(filterValue)) {
      return true;
    }

    const [from, to] = Array.isArray(filterValue)
      ? filterValue
      : [filterValue, undefined];
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
      accessorFn: (row) => String(row.sale_number ?? ""),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="N° Venta" />
      ),
      cell: ({ row }) => {
        const invoice = row.original;
        const saleNumber = invoice.sale_number ?? "—";

        return (
          <Link
            className="block font-mono text-sm transition-colors hover:text-blue-600"
            href={`/org/${orgSlug}/ventas/${invoice.id}`}
          >
            {saleNumber}
          </Link>
        );
      },
      meta: {
        label: "N° Venta",
        variant: "text",
        icon: Hash,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "invoice_number",
      accessorFn: (row) => row.invoice_number ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Factura" />
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.invoice_number ?? "—"}
        </div>
      ),
      meta: {
        label: "Factura",
        variant: "text",
        icon: FileDigit,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "customer",
      accessorFn: (row) => getCustomerDisplayName(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">
          {getCustomerDisplayName(row.original)}
        </div>
      ),
      meta: {
        label: "Cliente",
        variant: "multiSelect",
        options: customerOptions,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.customer.id);
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
        return <div>{seller?.name || seller?.email || "—"}</div>;
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
        <DataTableColumnHeader column={column} label="Fecha venta" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.sale_date
            ? formatDateOnly(row.original.sale_date)
            : "—"}
        </div>
      ),
      meta: {
        label: "Fecha venta",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.sale_date, parseDateOnly, value),
    },
    {
      id: "arca_authorized_at",
      accessorKey: "arca_authorized_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Emitida en" />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.arca_authorized_at
            ? formatDateTime(row.original.arca_authorized_at)
            : "—"}
        </div>
      ),
      meta: {
        label: "Emitida en",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
      filterFn: (row, _id, value) =>
        filterByDateRange(
          row.original.arca_authorized_at,
          parseTimestamp,
          value
        ),
    },
    {
      id: "invoice_type",
      accessorKey: "invoice_type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Comprobante" />
      ),
      cell: ({ row }) => (
        <div>
          {invoiceTypeLabels[row.original.invoice_type] ??
            row.original.invoice_type}
        </div>
      ),
      meta: {
        label: "Comprobante",
        variant: "multiSelect",
        options: (Object.keys(invoiceTypeLabels) as InvoiceType[]).map(
          (value) => ({
            label: invoiceTypeLabels[value],
            value,
          })
        ),
        icon: Receipt,
      },
      enableColumnFilter: true,
      enableSorting: true,
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
        <DataTableColumnHeader column={column} label="Estado venta" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          {saleStatusLabels[row.original.status] ?? row.original.status}
        </Badge>
      ),
      meta: {
        label: "Estado venta",
        variant: "multiSelect",
        options: (Object.keys(saleStatusLabels) as SalesOrderStatus[]).map(
          (value) => ({
            label: saleStatusLabels[value],
            value,
          })
        ),
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
      id: "arca_cae",
      accessorFn: (row) => row.arca_cae ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="CAE" />
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm">{row.original.arca_cae ?? "—"}</div>
      ),
      meta: {
        label: "CAE",
        variant: "text",
        icon: Ticket,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
    },
    {
      id: "point_and_voucher",
      accessorFn: (row) => formatArcaPointAndVoucher(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Punto / Número" />
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {formatArcaPointAndVoucher(row.original)}
        </div>
      ),
      meta: {
        label: "Punto / Número",
        variant: "text",
        icon: Hash,
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: true,
    },
    {
      id: "total_amount",
      accessorFn: (row) => row.total_amount ?? 0,
      header: ({ column }) => (
        <DataTableColumnHeader
          className="ml-auto justify-end"
          column={column}
          label="Total"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-semibold">
          {formatCurrency(row.original.total_amount)}
        </div>
      ),
      meta: {
        label: "Total",
        variant: "text",
        icon: DollarSign,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
    },
    {
      id: "download",
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <ArcaInvoicePreviewButton
            invoiceNumber={row.original.invoice_number}
            orgSlug={orgSlug}
            saleId={row.original.id}
          />
          <ArcaInvoiceDownloadButton
            orgSlug={orgSlug}
            saleId={row.original.id}
          />
        </div>
      ),
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
