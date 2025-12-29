"use client";

/**
 * Critical Stock Columns - Torre de Control
 * Column definitions for critical stock alerts
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { CriticalStockProduct } from "@/types/dashboard";

export function createCriticalStockColumns(): ColumnDef<CriticalStockProduct>[] {
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
      accessorKey: "current_stock",
      header: ({ column }) => (
        <div className="flex justify-end">
          <DataTableColumnHeader column={column} label="Stock" />
        </div>
      ),
      cell: ({ row }) => {
        const stock = row.getValue("current_stock") as number;
        return (
          <div className="text-right font-semibold text-red-600 tabular-nums">
            {stock}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "min_stock",
      header: ({ column }) => (
        <div className="flex justify-end">
          <DataTableColumnHeader column={column} label="Stock Mínimo" />
        </div>
      ),
      cell: ({ row }) => {
        const minStock = row.getValue("min_stock") as number;
        return (
          <div className="text-right text-muted-foreground tabular-nums">
            {minStock}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "alert_type",
      header: ({ column }) => (
        <div className="pl-8">
          <DataTableColumnHeader column={column} label="Tipo de Alerta" />
        </div>
      ),
      cell: ({ row }) => {
        const currentStock = row.getValue("current_stock") as number;

        // Determine alert type based on stock level
        const alertType = currentStock === 0 ? "Sin Stock" : "Crítico";

        return (
          <div className="pl-8">
            <Badge variant="destructive">{alertType}</Badge>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: true,
    },
  ];
}
