"use client";

/**
 * Top Clients Data Table V2 - Torre de Control
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import type { TopPerformersResponse } from "@/types/dashboard";
import { createTopClientsColumns } from "./top-clients-columns";

type TopClientsDataTableProps = {
  data: TopPerformersResponse["topClients"];
};

export function TopClientsDataTable({ data }: TopClientsDataTableProps) {
  const columns = createTopClientsColumns();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSorting: true,
    enableFilters: false,
  });

  return <DataTable hidePagination table={table} />;
}
