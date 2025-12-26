"use client";

/**
 * Top Clients Data Table
 * Tabla de mejores clientes usando el sistema data-table
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table";
import type { TopClient } from "@/modules/dashboard/types";
import { createTopClientsColumns } from "./top-clients-columns";

type TopClientsDataTableProps = {
  clients: TopClient[];
};

export function TopClientsDataTable({ clients }: TopClientsDataTableProps) {
  const columns = useMemo(() => createTopClientsColumns(), []);

  const table = useReactTable({
    data: clients,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    initialState: {
      pagination: {
        pageSize: 5,
      },
    },
  });

  return <DataTable hidePagination table={table} />;
}
