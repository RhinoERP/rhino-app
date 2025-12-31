"use client";

/**
 * Order Board Columns V2 - Torre de Control
 * Column definitions for order status board
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import type { OrderStatusItem } from "@/types/dashboard";

export function createOrderBoardColumns(): ColumnDef<OrderStatusItem>[] {
  return [
    {
      accessorKey: "invoiceNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Factura" />
      ),
      cell: ({ row }) => {
        const invoiceNumber = row.getValue("invoiceNumber") as string | null;
        return (
          <div className="font-medium">{invoiceNumber || "Sin número"}</div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "customerName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => <div>{row.getValue("customerName")}</div>,
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "saleDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Fecha" />
      ),
      cell: ({ row }) => {
        const date = row.getValue("saleDate") as string;
        return (
          <div className="text-muted-foreground text-sm">
            {new Date(date).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <div className="flex justify-end">
          <DataTableColumnHeader column={column} label="Monto" />
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.getValue("totalAmount") as number;
        return (
          <div className="text-right font-semibold tabular-nums">
            {formatCurrency(amount)}
          </div>
        );
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as string;

        // Map de estados de base de datos a español (matching Compras)
        const statusMap: Record<
          string,
          {
            label: string;
            variant: "default" | "secondary" | "destructive" | "outline";
          }
        > = {
          ORDERED: { label: "Ordenada", variant: "secondary" },
          IN_TRANSIT: { label: "En tránsito", variant: "default" },
          RECEIVED: { label: "Recibida", variant: "outline" },
          CANCELLED: { label: "Cancelada", variant: "destructive" },
          DISPATCH: { label: "Despachada", variant: "default" },
        };

        const statusInfo = statusMap[status] || {
          label: status,
          variant: "secondary",
        };

        return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
      },
      enableSorting: true,
      enableHiding: true,
    },
  ];
}
