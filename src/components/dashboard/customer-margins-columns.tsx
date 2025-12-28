"use client";

/**
 * Customer Margins Table Columns
 * Columnas para la tabla de márgenes por cliente
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { CustomerMargin } from "@/modules/dashboard/types";

export function createCustomerMarginsColumns(): ColumnDef<CustomerMargin>[] {
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
