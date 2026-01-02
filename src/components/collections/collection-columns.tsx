"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { SlidersHorizontalIcon } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type {
  CollectionAccountStatus,
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";
import { CollectionActionsMenu } from "./collection-actions-menu";

const statusLabels: Record<
  CollectionAccountStatus,
  { label: string; badgeClass: string }
> = {
  PENDING: {
    label: "Pendiente",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  PARTIAL: {
    label: "Parcial",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
  },
  PAID: {
    label: "Pagado",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

type StatusBadgeProps = {
  status: CollectionAccountStatus;
};

function StatusBadge({ status }: StatusBadgeProps) {
  const info = statusLabels[status] ?? statusLabels.PENDING;
  return (
    <Badge className={`rounded-full ${info.badgeClass}`} variant="outline">
      {info.label}
    </Badge>
  );
}

export function createReceivableColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = []
): ColumnDef<ReceivableAccount>[] {
  return [
    {
      id: "customer",
      accessorFn: (row) =>
        row.customer.fantasy_name || row.customer.business_name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => {
        const customer = row.original.customer;
        return (
          <div className="space-y-0.5">
            <p className="font-medium text-sm">
              {customer.fantasy_name || customer.business_name}
            </p>
            {customer.fantasy_name && customer.business_name ? (
              <p className="text-muted-foreground text-xs">
                {customer.business_name}
              </p>
            ) : null}
          </div>
        );
      },
      meta: {
        label: "Cliente",
        variant: "multiSelect",
        options: customerOptions,
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.customer.id);
      },
    },
    {
      id: "invoice",
      accessorKey: "sale.invoice_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Documento" />
      ),
      cell: ({ row }) => {
        const sale = row.original.sale;
        if (sale?.invoice_number) {
          return (
            <div className="font-mono text-xs">
              {sale.invoice_number.toString().padStart(6, "0")}
            </div>
          );
        }
        return (
          <div className="text-muted-foreground text-xs">
            Venta {row.original.sales_order_id.slice(0, 8)}
          </div>
        );
      },
      enableSorting: false,
      enableColumnFilter: false,
    },
    {
      id: "due_date",
      accessorKey: "due_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vencimiento" />
      ),
      cell: ({ row }) => (
        <div className="text-sm">{formatDateOnly(row.original.due_date)}</div>
      ),
      meta: {
        label: "Vencimiento",
        variant: "date",
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) => {
        if (!value) {
          return true;
        }
        const rowDate = new Date(row.original.due_date);
        const filterDate = new Date(value as string);
        return rowDate <= filterDate;
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      meta: {
        label: "Estado",
        variant: "multiSelect",
        options: [
          { label: statusLabels.PENDING.label, value: "PENDING" },
          { label: statusLabels.PARTIAL.label, value: "PARTIAL" },
          { label: statusLabels.PAID.label, value: "PAID" },
        ],
      },
      enableSorting: false,
      enableColumnFilter: true,
      filterFn: (row, id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.getValue(id));
      },
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
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(row.original.total_amount)}
        </div>
      ),
      meta: {
        label: "Total",
        variant: "number",
      },
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: "pending_balance",
      accessorKey: "pending_balance",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="ml-auto justify-end"
          column={column}
          label="Pendiente"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-semibold">
          {formatCurrency(row.original.pending_balance)}
        </div>
      ),
      meta: {
        label: "Pendiente",
        variant: "number",
      },
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      enableColumnFilter: false,
      header: () => <SlidersHorizontalIcon className="mr-2 ml-auto size-4" />,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <CollectionActionsMenu
            accountId={row.original.id}
            counterpartyName={row.original.customer.business_name}
            dueDate={row.original.due_date}
            orgId={row.original.organization_id}
            orgSlug={orgSlug}
            pendingBalance={row.original.pending_balance}
            totalAmount={row.original.total_amount}
            type="receivable"
          />
        </div>
      ),
    },
  ];
}

export function createPayableColumns(
  orgSlug: string,
  supplierOptions: Array<{ label: string; value: string }> = []
): ColumnDef<PayableAccount>[] {
  return [
    {
      id: "supplier",
      accessorKey: "supplier.name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Proveedor" />
      ),
      cell: ({ row }) => (
        <div className="font-medium text-sm">{row.original.supplier.name}</div>
      ),
      meta: {
        label: "Proveedor",
        variant: "multiSelect",
        options: supplierOptions,
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.original.supplier.id);
      },
    },
    {
      id: "purchase_number",
      accessorKey: "purchase.purchase_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Compra" />
      ),
      cell: ({ row }) => {
        const purchase = row.original.purchase;
        if (purchase?.purchase_number) {
          return (
            <div className="font-mono text-xs">
              {purchase.purchase_number.toString().padStart(6, "0")}
            </div>
          );
        }

        return (
          <div className="text-muted-foreground text-xs">
            OC {row.original.purchase_order_id.slice(0, 8)}
          </div>
        );
      },
      enableSorting: false,
      enableColumnFilter: false,
    },
    {
      id: "due_date",
      accessorKey: "due_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vencimiento" />
      ),
      cell: ({ row }) => (
        <div className="text-sm">{formatDateOnly(row.original.due_date)}</div>
      ),
      meta: {
        label: "Vencimiento",
        variant: "date",
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) => {
        if (!value) {
          return true;
        }
        const rowDate = new Date(row.original.due_date);
        const filterDate = new Date(value as string);
        return rowDate <= filterDate;
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      meta: {
        label: "Estado",
        variant: "multiSelect",
        options: [
          { label: statusLabels.PENDING.label, value: "PENDING" },
          { label: statusLabels.PARTIAL.label, value: "PARTIAL" },
          { label: statusLabels.PAID.label, value: "PAID" },
        ],
      },
      enableSorting: false,
      enableColumnFilter: true,
      filterFn: (row, id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        return filterValues.includes(row.getValue(id));
      },
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
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(row.original.total_amount)}
        </div>
      ),
      meta: {
        label: "Total",
        variant: "number",
      },
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: "pending_balance",
      accessorKey: "pending_balance",
      header: ({ column }) => (
        <DataTableColumnHeader
          className="ml-auto justify-end"
          column={column}
          label="Pendiente"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-semibold">
          {formatCurrency(row.original.pending_balance)}
        </div>
      ),
      meta: {
        label: "Pendiente",
        variant: "number",
      },
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      enableColumnFilter: false,
      header: () => <SlidersHorizontalIcon className="mr-2 ml-auto size-4" />,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <CollectionActionsMenu
            accountId={row.original.id}
            counterpartyName={row.original.supplier.name}
            dueDate={row.original.due_date}
            orgId={row.original.organization_id}
            orgSlug={orgSlug}
            pendingBalance={row.original.pending_balance}
            totalAmount={row.original.total_amount}
            type="payable"
          />
        </div>
      ),
    },
  ];
}
