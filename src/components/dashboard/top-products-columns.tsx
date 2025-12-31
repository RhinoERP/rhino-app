"use client";

/**
 * Top Products Columns V2 - Torre de Control
 * Column definitions for top performing products
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatCurrency } from "@/lib/format";
import type { TopPerformersResponse } from "@/types/dashboard";

type TopProduct = TopPerformersResponse["topProducts"][number];

export function createTopProductsColumns(): ColumnDef<TopProduct>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div>
            <div className="font-medium">{product.name}</div>
            <div className="text-muted-foreground text-xs">{product.sku}</div>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "units_sold",
      header: ({ column }) => (
        <div className="flex justify-end">
          <DataTableColumnHeader column={column} label="Unidades" />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {row.getValue("units_sold")}
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "total_amount",
      header: ({ column }) => (
        <div className="flex justify-end">
          <DataTableColumnHeader column={column} label="Total" />
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.getValue("total_amount") as number;
        return (
          <div className="text-right font-semibold tabular-nums">
            {formatCurrency(amount)}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
  ];
}
