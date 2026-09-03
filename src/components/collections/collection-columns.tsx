"use client";

import { CalendarCheck } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, MapPin, SlidersHorizontalIcon } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function formatReceivableDocument(account: ReceivableAccount): string {
  if (account.collection_label) {
    return account.collection_label;
  }
  const invoiceNumber = account.sale?.invoice_number?.toString();

  if (invoiceNumber !== null && invoiceNumber !== undefined) {
    return `N° de factura ${invoiceNumber}`;
  }

  const remittance = account.sale?.remittance_number;

  if (remittance !== null && remittance !== undefined) {
    return `N° de remito ${remittance}`;
  }

  return `N° de orden ${account.sales_order_id.slice(0, 8)}`;
}

function parseDateValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseFilterTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return parseFilterTimestamp(value[0]);
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function filterByDateRange(
  dateString: string | null | undefined,
  value: unknown
): boolean {
  const target = parseDateValue(dateString);
  if (target === null) {
    return false;
  }

  if (!value || (Array.isArray(value) && value.every((item) => !item))) {
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
}

export function createReceivableColumns(
  orgSlug: string,
  customerOptions: Array<{ label: string; value: string }> = [],
  sellerOptions: Array<{ label: string; value: string }> = []
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
      id: "empresa",
      accessorFn: (row) => row.customer.business_name || null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Empresa" />
      ),
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.customer.business_name || "—"}
        </div>
      ),
      enableSorting: true,
      enableColumnFilter: false,
    },
    {
      id: "seller",
      accessorFn: (row) =>
        row.seller?.name || row.seller?.email || row.seller?.id || null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vendedor" />
      ),
      cell: ({ row }) => {
        const seller = row.original.seller;
        if (!seller) {
          return <div className="text-muted-foreground text-sm">—</div>;
        }
        return (
          <div className="text-sm">
            {seller.name || seller.email || seller.id}
          </div>
        );
      },
      meta: {
        label: "Vendedor",
        variant: "multiSelect",
        options: sellerOptions,
      },
      enableSorting: true,
      enableColumnFilter: sellerOptions.length > 0,
      filterFn: (row, _id, value) => {
        const filterValues = Array.isArray(value) ? value : [value];
        const sellerId = row.original.seller?.id;
        if (!sellerId) {
          return false;
        }
        return filterValues.includes(sellerId);
      },
    },
    {
      id: "invoice",
      accessorFn: (row) => formatReceivableDocument(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Documento" />
      ),
      cell: ({ row }) => {
        const label = row.getValue("invoice") as string;
        return <div className="font-mono text-xs">{label}</div>;
      },
      sortingFn: "alphanumeric",
      enableSorting: true,
      enableColumnFilter: false,
      meta: {
        label: "Documento",
      },
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Creación" />
      ),
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">
          {row.original.created_at
            ? formatDateOnly(row.original.created_at)
            : "—"}
        </div>
      ),
      meta: {
        label: "Creación en",
        variant: "dateRange",
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.created_at, value),
    },
    {
      id: "dispatched_at",
      accessorFn: (row) => row.sale?.dispatched_at ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Despacho" />
      ),
      cell: ({ row }) => {
        const dispatchedAt = row.original.sale?.dispatched_at;
        return (
          <div className="text-sm">
            {dispatchedAt ? formatDateOnly(dispatchedAt) : "—"}
          </div>
        );
      },
      meta: {
        label: "Despacho",
        variant: "dateRange",
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.sale?.dispatched_at, value),
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
      id: "payment_date",
      accessorFn: (row) => row.last_payment_date ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha de Pago" />
      ),
      cell: ({ row }) => {
        const lastPaymentDate = row.original.last_payment_date;
        const status = row.original.status;

        // Si el estado es "PENDING" o no hay fecha de pago, mostrar guion
        if (status === "PENDING" || !lastPaymentDate) {
          return <div className="text-muted-foreground text-sm">—</div>;
        }

        return <div className="text-sm">{formatDateOnly(lastPaymentDate)}</div>;
      },
      meta: {
        label: "Fecha de Pago",
        variant: "dateRange",
        icon: CalendarCheck,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.last_payment_date, value),
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
          {formatCurrency(row.original.total_amount, row.original.currency)}
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
          {formatCurrency(row.original.pending_balance, row.original.currency)}
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
      id: "city",
      accessorFn: (row) => row.customer.city ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Localidad" />
      ),
      cell: ({ row }) => {
        const city = row.original.customer.city;
        return (
          <div className="text-muted-foreground text-sm">{city ?? "—"}</div>
        );
      },
      meta: {
        label: "Localidad",
        variant: "text",
        icon: MapPin,
      },
      enableSorting: true,
      enableColumnFilter: false,
      enableHiding: true,
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
            counterpartyId={row.original.customer.id}
            counterpartyName={row.original.customer.business_name}
            currency={row.original.currency}
            dueDate={row.original.due_date}
            orgId={row.original.organization_id}
            orgSlug={orgSlug}
            pendingBalance={row.original.pending_balance}
            supplierId={row.original.supplier?.id ?? null}
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
      id: "created_at",
      accessorKey: "created_at",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Creación" />
      ),
      cell: ({ row }) => (
        <div className="text-muted-foreground text-sm">
          {row.original.created_at
            ? formatDateOnly(row.original.created_at)
            : "—"}
        </div>
      ),
      meta: {
        label: "Creación en",
        variant: "dateRange",
      },
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.created_at, value),
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
      id: "payment_date",
      accessorFn: (row) => row.last_payment_date ?? null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha de Pago" />
      ),
      cell: ({ row }) => {
        const lastPaymentDate = row.original.last_payment_date;
        const status = row.original.status;

        // Si el estado es "PENDING" o no hay fecha de pago, mostrar guion
        if (status === "PENDING" || !lastPaymentDate) {
          return <div className="text-muted-foreground text-sm">—</div>;
        }

        return <div className="text-sm">{formatDateOnly(lastPaymentDate)}</div>;
      },
      meta: {
        label: "Fecha de Pago",
        variant: "dateRange",
        icon: CalendarCheck,
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: true,
      filterFn: (row, _id, value) =>
        filterByDateRange(row.original.last_payment_date, value),
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
      cell: ({ row }) => {
        const hasDiscrepancy = row.original.hasDiscrepancy;
        const discrepancyAmount = row.original.discrepancyAmount;
        const purchaseTotal = row.original.purchase?.total_amount;

        if (hasDiscrepancy && discrepancyAmount && purchaseTotal) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-end gap-1.5 text-right font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    {formatCurrency(
                      row.original.total_amount,
                      row.original.currency
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold text-sm">
                    ⚠️ Discrepancia Detectada
                  </p>
                  <p className="mt-1 text-xs">
                    El total en la cuenta (
                    {formatCurrency(
                      row.original.total_amount,
                      row.original.currency
                    )}
                    ) difiere del total de la orden de compra (
                    {formatCurrency(purchaseTotal, row.original.currency)}) por{" "}
                    {formatCurrency(discrepancyAmount, row.original.currency)}.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return (
          <div className="text-right font-medium">
            {formatCurrency(row.original.total_amount, row.original.currency)}
          </div>
        );
      },
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
          {formatCurrency(row.original.pending_balance, row.original.currency)}
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
            counterpartyId={row.original.supplier.id}
            counterpartyName={row.original.supplier.name}
            currency={row.original.currency}
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
