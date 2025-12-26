"use client";

/**
 * Product Margins Table Columns
 * Columnas para la tabla de márgenes por producto
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { ProductMargin } from "@/modules/dashboard/types";

export function createProductMarginsColumns(): ColumnDef<ProductMargin>[] {
  return [
    {
      accessorKey: "productName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Producto" />
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("productName")}</div>
          <div className="text-muted-foreground text-sm">
            {row.original.sku}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "marginPercentage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Margen %" />
      ),
      cell: ({ row }) => {
        const margin = row.getValue("marginPercentage") as number;
        let variant: "default" | "secondary" | "destructive" = "destructive";

        if (margin > 25) {
          variant = "default";
        } else if (margin > 15) {
          variant = "secondary";
        }

        return <Badge variant={variant}>{margin.toFixed(1)}%</Badge>;
      },
    },
    {
      accessorKey: "margin",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Monto" />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("margin") as number;
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
