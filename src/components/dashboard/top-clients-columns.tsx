"use client";

/**
 * Top Clients Columns V2 - Torre de Control
 * Column definitions for top performing clients
 */

import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { formatCurrency } from "@/lib/format";
import type { TopPerformersResponse } from "@/types/dashboard";

type TopClient = TopPerformersResponse["topClients"][number];

export function createTopClientsColumns(): ColumnDef<TopClient>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Cliente" />
      ),
      cell: ({ row }) => {
        const client = row.original;
        return <div className="font-medium">{client.name}</div>;
      },
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "order_count",
      header: ({ column }) => (
        <div className="flex justify-end">
          <DataTableColumnHeader column={column} label="Pedidos" />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {row.getValue("order_count")}
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
