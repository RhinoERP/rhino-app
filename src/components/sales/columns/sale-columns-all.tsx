"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  HashIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  DollarSign,
  Hash,
  MapPin,
  Package,
  Receipt,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import type { InvoiceType, SalesOrderStatus } from "@/modules/sales/types";
import { getSaleSupplierDisplayName } from "../shared/sales-filter-options";
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
  INCOMPLETE: {
    label: "Incompleta",
    icon: ClipboardTextIcon,
    iconColor: "text-yellow-500",
  },
};

export const invoiceTypeLabels: Record<InvoiceType, string> =
  INVOICE_TYPE_LABELS;

export function getCustomerDisplayName(sale: SalesOrderWithCustomer): string {
  return (
    sale.customer?.fantasy_name ||
    sale.customer?.business_name ||
    "Cliente desconocido"
  );
}

function computeDraftTotal(sale: SalesOrderWithCustomer): number {
  const subtotal = (sale.items ?? []).reduce(
    (sum, item) => sum + (item.subtotal ?? 0),
    0
  );
  const normalizedDiscountPercent = Math.min(
    Math.max(sale.global_discount_percentage ?? 0, 0),
    100
  );
  const computedGlobalDiscount =
    (normalizedDiscountPercent / 100) * Math.max(0, subtotal);
  const globalDiscountAmount =
    sale.global_discount_amount ?? computedGlobalDiscount;
  const discountedSubtotal = Math.max(0, subtotal - globalDiscountAmount);
  const taxAmount = sale.total_tax_amount ?? 0;

  return Math.max(0, discountedSubtotal + taxAmount);
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

type SalesColumnsOptions = {
  orgSlug: string;
  customerOptions?: Array<{ label: string; value: string }>;
  sellerOptions?: Array<{ label: string; value: string }>;
  supplierOptions?: Array<{ label: string; value: string }>;
  includeStatusFilter?: boolean;
  carrierOptions?: Array<{ label: string; value: string }>;
};

export function createSalesColumns({
  orgSlug,
  customerOptions = [],
  sellerOptions = [],
  supplierOptions = [],
  includeStatusFilter = true,
  carrierOptions = [],
}: SalesColumnsOptions): ColumnDef<SalesOrderWithCustomer>[] {
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
      accessorFn: (row) =>
        row.customer?.fantasy_name || row.customer?.business_name || "",
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
      enableColumnFilter: false,
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
      id: "locality",
      accessorFn: (row) =>
        row.customer?.delivery_city ?? row.customer?.city ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Localidad" />
      ),
      cell: ({ row }) => {
        const city =
          row.original.customer?.delivery_city ?? row.original.customer?.city;
        return <div className="text-sm">{city ?? "—"}</div>;
      },
      meta: {
        label: "Localidad",
        variant: "text",
        icon: MapPin,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
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
      enableColumnFilter: sellerOptions.length > 1,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.user_id);
      },
    },
    {
      id: "supplier",
      accessorFn: (row) => getSaleSupplierDisplayName(row) ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Proveedor" />
      ),
      cell: ({ row }) => {
        const supplierName = getSaleSupplierDisplayName(row.original);
        return <div className="text-sm">{supplierName ?? "—"}</div>;
      },
      meta: {
        label: "Proveedor",
        variant: "multiSelect",
        options: supplierOptions,
        icon: Package,
      },
      enableColumnFilter: supplierOptions.length > 0,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const supplierName = getSaleSupplierDisplayName(row.original);
        if (!supplierName) {
          return false;
        }

        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(supplierName);
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
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.sale_date, value),
    },
    {
      id: "confirmed_at",
      accessorKey: "confirmed_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Confirmada el" />
      ),
      cell: ({ row }) => {
        const ts = row.original.confirmed_at;
        return <div className="text-sm">{ts ? formatDateOnly(ts) : "—"}</div>;
      },
      meta: {
        label: "Confirmada el",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.confirmed_at, value),
    },
    {
      id: "dispatched_at",
      accessorKey: "dispatched_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Despachada el" />
      ),
      cell: ({ row }) => {
        const ts = row.original.dispatched_at;
        return <div className="text-sm">{ts ? formatDateOnly(ts) : "—"}</div>;
      },
      meta: {
        label: "Despachada el",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.dispatched_at, value),
    },
    {
      id: "delivered_at",
      accessorKey: "delivered_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Entregada el" />
      ),
      cell: ({ row }) => {
        const ts = row.original.delivered_at;
        return <div className="text-sm">{ts ? formatDateOnly(ts) : "—"}</div>;
      },
      meta: {
        label: "Entregada el",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.delivered_at, value),
    },
    {
      id: "cancelled_at",
      accessorKey: "cancelled_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cancelada el" />
      ),
      cell: ({ row }) => {
        const ts = row.original.cancelled_at;
        return <div className="text-sm">{ts ? formatDateOnly(ts) : "—"}</div>;
      },
      meta: {
        label: "Cancelada el",
        variant: "dateRange",
        icon: Calendar,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.cancelled_at, value),
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
      id: "remittance_number",
      accessorKey: "remittance_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="N° Remito" />
      ),
      cell: ({ row }) => {
        const remittance = row.original.remittance_number;
        return <div className="text-sm">{remittance ?? "—"}</div>;
      },
      meta: {
        label: "N° Remito",
        variant: "text",
        icon: Hash,
      },
      sortingFn: "alphanumeric",
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
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
      accessorFn: (row) =>
        row.status === "DRAFT"
          ? computeDraftTotal(row)
          : (row.total_amount ?? 0),
      header: ({ column }) => (
        <DataTableColumnHeader
          className="ml-auto justify-end"
          column={column}
          label="Total"
        />
      ),
      cell: ({ row }) => {
        const amount =
          row.original.status === "DRAFT"
            ? computeDraftTotal(row.original)
            : row.original.total_amount;
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
    {
      id: "carrier",
      accessorFn: (row) => row.carrier?.name ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Transporte" />
      ),
      cell: ({ row }) => {
        const carrier = row.original.carrier;
        if (!carrier) {
          return <div className="text-muted-foreground text-sm">—</div>;
        }
        return (
          <div className="flex items-center gap-2 text-sm">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            {carrier.name}
          </div>
        );
      },
      meta: {
        label: "Transporte",
        variant: "multiSelect",
        options: carrierOptions,
        icon: Truck,
      },
      enableColumnFilter: carrierOptions.length > 0,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.carrier?.id ?? "");
      },
    },
    createSalesActionsColumn(orgSlug),
  ];
}
