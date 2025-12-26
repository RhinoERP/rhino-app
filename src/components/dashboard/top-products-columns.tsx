"use client";

/**
 * Top Products Table Columns
 * Columnas para la tabla de productos más vendidos
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import type { TopProduct } from "@/modules/dashboard/types";

export function createTopProductsColumns(): ColumnDef<TopProduct>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          <div className="text-muted-foreground text-sm">
            {row.original.sku}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "unitsSold",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Unidades" />
      ),
      cell: ({ row }) => <div>{row.getValue("unitsSold")}</div>,
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
