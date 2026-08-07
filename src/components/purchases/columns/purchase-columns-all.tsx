"use client";

import {
  CheckCircleIcon,
  ClipboardTextIcon,
  HashIcon,
  TruckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, DollarSign, Hash } from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import {
  createActionsColumn,
  filterPurchaseByDateRange,
} from "./purchase-columns-shared";

const statusLabels: Record<
  PurchaseOrderWithSupplier["status"],
  {
    label: string;
    icon: typeof ClipboardTextIcon;
    iconColor: string;
  }
> = {
  DRAFT: {
    label: "Borrador",
    icon: ClipboardTextIcon,
    iconColor: "text-gray-400",
  },
  ORDERED: {
    label: "Ordenada",
    icon: ClipboardTextIcon,
    iconColor: "text-blue-500",
  },
  IN_TRANSIT: {
    label: "En tránsito",
    icon: TruckIcon,
    iconColor: "text-orange-500",
  },
  RECEIVED: {
    label: "Recibida",
    icon: CheckCircleIcon,
    iconColor: "text-green-500",
  },
  CANCELLED: {
    label: "Cancelada",
    icon: XCircleIcon,
    iconColor: "text-red-500",
  },
};

function getStatusInfo(status: PurchaseOrderWithSupplier["status"] | null) {
  if (status && status in statusLabels) {
    return statusLabels[status as keyof typeof statusLabels];
  }

  return {
    label: status?.trim() || "Sin estado",
    icon: ClipboardTextIcon,
    iconColor: "text-muted-foreground",
  };
}

export function createAllPurchasesColumns(
  orgSlug: string,
  supplierOptions: Array<{ label: string; value: string }> = []
): ColumnDef<PurchaseOrderWithSupplier>[] {
  return [
    {
      id: "purchase_number",
      accessorKey: "purchase_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="N° Compra" />
      ),
      cell: ({ row }) => {
        const purchase = row.original;
        const purchaseNumber = purchase.purchase_number;

        if (!purchaseNumber) {
          return <div className="font-medium text-sm">—</div>;
        }

        const formattedNumber = String(purchaseNumber).padStart(6, "0");

        return (
          <Link
            className="block font-mono text-sm transition-colors hover:text-blue-600"
            href={`/org/${orgSlug}/compras/${purchase.id}`}
          >
            {formattedNumber}
          </Link>
        );
      },
      meta: {
        label: "N° Compra",
        variant: "text",
        icon: HashIcon,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "supplier",
      accessorKey: "supplier.name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Proveedor" />
      ),
      cell: ({ row }) => {
        const purchase = row.original;
        const supplier = purchase.supplier;

        if (!supplier) {
          return (
            <div className="font-medium text-muted-foreground">Sin asignar</div>
          );
        }

        return (
          <Link
            className="block transition-colors hover:text-blue-600"
            href={`/org/${orgSlug}/compras/${purchase.id}`}
          >
            <div className="font-medium">{supplier.name}</div>
          </Link>
        );
      },
      meta: {
        label: "Proveedor",
        variant: "multiSelect",
        options: supplierOptions,
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: false,
      filterFn: (row, _id, value) => {
        const supplier = row.original.supplier;
        if (!supplier) {
          return false;
        }
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(supplier.id);
      },
    },
    {
      id: "purchase_date",
      accessorKey: "purchase_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha" />
      ),
      cell: ({ row }) => {
        const date = row.original.purchase_date;
        return <div className="text-sm">{formatDateOnly(date)}</div>;
      },
      meta: {
        label: "Fecha",
        variant: "text",
        icon: Calendar,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
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
        variant: "text",
        icon: Calendar,
      },
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: true,
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
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: true,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        const statusInfo = getStatusInfo(status);
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
      meta: {
        label: "Estado",
        variant: "multiSelect",
        options: Object.entries(statusLabels).map(([value, info]) => ({
          label: info.label,
          value,
        })),
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "in_transit_at",
      accessorKey: "in_transit_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="En tránsito el" />
      ),
      cell: ({ row }) => {
        const ts = row.original.in_transit_at;
        return <div className="text-sm">{ts ? formatDateOnly(ts) : "—"}</div>;
      },
      meta: { label: "En tránsito el", variant: "dateRange", icon: Calendar },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterPurchaseByDateRange(row.original.in_transit_at, value),
    },
    {
      id: "received_at",
      accessorKey: "received_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Recibida el" />
      ),
      cell: ({ row }) => {
        const ts = row.original.received_at;
        return <div className="text-sm">{ts ? formatDateOnly(ts) : "—"}</div>;
      },
      meta: { label: "Recibida el", variant: "dateRange", icon: Calendar },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterPurchaseByDateRange(row.original.received_at, value),
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
      meta: { label: "Cancelada el", variant: "dateRange", icon: Calendar },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterPurchaseByDateRange(row.original.cancelled_at, value),
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
    createActionsColumn(orgSlug),
  ];
}
