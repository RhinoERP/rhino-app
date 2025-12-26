"use client";

/**
 * Top Clients Table Columns
 * Columnas para la tabla de mejores clientes
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { TopClient } from "@/modules/dashboard/types";

export function createTopClientsColumns(): ColumnDef<TopClient>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "orderCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Pedidos" />
      ),
      cell: ({ row }) => <div>{row.getValue("orderCount")}</div>,
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Total" />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("totalAmount") as number;
        const formatted = new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
        return <div className="font-medium">{formatted}</div>;
      },
    },
  ];
}
