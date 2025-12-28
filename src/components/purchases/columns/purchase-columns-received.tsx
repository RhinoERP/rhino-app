"use client";

import { HashIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calendar, DollarSign, Hash } from "lucide-react";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { PurchaseOrderWithSupplier } from "@/modules/purchases/service/purchases.service";
import { createActionsColumn } from "./purchase-columns-shared";

export function createReceivedPurchasesColumns(
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
        <DataTableColumnHeader column={column} label="Fecha de orden" />
      ),
      cell: ({ row }) => {
        const date = row.original.purchase_date;
        return <div className="text-sm">{formatDateOnly(date)}</div>;
      },
      meta: {
        label: "Fecha de orden",
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
      id: "payment_due_date",
      accessorKey: "payment_due_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vencimiento" />
      ),
      cell: ({ row }) => {
        const date = row.original.payment_due_date;
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
