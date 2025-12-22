"use client";

import { DotsThreeOutlineVerticalIcon, HashIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Calendar,
  DollarSign,
  Hash,
  SlidersHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";

type PurchaseActionsCellProps = {
  purchase: PurchaseOrderWithSupplier;
  orgSlug: string;
};

function PurchaseActionsCell({ purchase, orgSlug }: PurchaseActionsCellProps) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Abrir menú</span>
            <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <Link
              className="flex w-full items-center"
              href={`/org/${orgSlug}/compras/${purchase.id}`}
            >
              Ver detalles
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const statusLabels: Record<
  PurchaseOrderWithSupplier["status"],
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  ORDERED: { label: "Ordenada", variant: "default" },
  IN_TRANSIT: { label: "En tránsito", variant: "default" },
  RECEIVED: { label: "Recibida", variant: "secondary" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
};

export const createPurchaseColumns = (
  orgSlug: string,
  supplierOptions: Array<{ label: string; value: string }> = []
): ColumnDef<PurchaseOrderWithSupplier>[] => [
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
          className="block font-medium text-sm transition-colors hover:text-blue-600"
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
          <div className="font-medium text-muted-foreground">
            Proveedor desconocido
          </div>
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
    enableSorting: true,
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
    id: "payment_due_date",
    accessorKey: "payment_due_date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Vencimiento" />
    ),
    cell: ({ row }) => {
      const date = row.original.payment_due_date;
      return <div className="text-sm">{date ? formatDateOnly(date) : "—"}</div>;
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
      const statusInfo = statusLabels[status];

      return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
    },
    meta: {
      label: "Estado",
      variant: "multiSelect",
      options: [
        { label: "Ordenada", value: "ORDERED" },
        { label: "Recibida", value: "RECEIVED" },
        { label: "Cancelada", value: "CANCELLED" },
      ],
    },
    enableColumnFilter: true,
    enableSorting: false,
    enableHiding: false,
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
      const amount = row.original.total_amount;
      return (
        <div className="text-right font-semibold">{formatCurrency(amount)}</div>
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
    header: () => <SlidersHorizontalIcon className="mr-2 ml-auto size-4" />,
    id: "actions",
    enableHiding: false,
    enableColumnFilter: false,
    enableSorting: false,
    size: 10,
    enableResizing: true,
    cell: ({ row }) => (
      <PurchaseActionsCell orgSlug={orgSlug} purchase={row.original} />
    ),
  },
];
