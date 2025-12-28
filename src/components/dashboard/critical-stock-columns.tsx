"use client";

/**
 * Critical Stock Products Table Columns
 * Columnas para la tabla de productos con stock crítico
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { StockProduct } from "@/modules/dashboard/types";

export function createCriticalStockColumns(): ColumnDef<StockProduct>[] {
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
      accessorKey: "currentStock",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock Actual" />
      ),
      cell: ({ row }) => <div>{row.getValue("currentStock")}</div>,
    },
    {
      accessorKey: "minimumStock",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Stock Mínimo" />
      ),
      cell: ({ row }) => (
        <div className="text-muted-foreground">
          {row.getValue("minimumStock")}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        let variant: "default" | "secondary" | "destructive" = "default";
        let label = "Normal";

        if (status === "critical") {
          variant = "destructive";
          label = "Crítico";
        } else if (status === "slow") {
          variant = "secondary";
          label = "Lento";
        }

        return <Badge variant={variant}>{label}</Badge>;
      },
    },
  ];
}
