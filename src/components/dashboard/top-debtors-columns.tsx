"use client";

/**
 * Top Debtors Table Columns
 * Columnas para la tabla de clientes deudores
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { TopDebtor } from "@/modules/dashboard/types";

export function createTopDebtorsColumns(): ColumnDef<TopDebtor>[] {
  return [
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("customerName")}</div>
      ),
    },
    {
      accessorKey: "totalDebt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Deuda Total" />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("totalDebt") as number;
        const formatted = new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
        return <div className="font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "overdueAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Vencido" />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("overdueAmount") as number;
        if (amount === 0) {
          return <div className="text-muted-foreground">—</div>;
        }
        const formatted = new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
        return <div className="font-medium text-red-600">{formatted}</div>;
      },
    },
    {
      accessorKey: "oldestInvoiceDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const overdueAmount = row.original.overdueAmount;
        if (overdueAmount > 0) {
          return <Badge variant="destructive">Vencido</Badge>;
        }
        return <Badge variant="secondary">Al día</Badge>;
      },
    },
  ];
}
