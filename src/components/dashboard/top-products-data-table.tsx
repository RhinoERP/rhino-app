"use client";

/**
 * Top Products Data Table - Torre de Control
 */

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import type { TopPerformersResponse } from "@/types/dashboard";
import { createTopProductsColumns } from "./top-products-columns";

type TopProductsDataTableProps = {
  data: TopPerformersResponse["topProducts"];
};

export function TopProductsDataTable({ data }: TopProductsDataTableProps) {
  const columns = createTopProductsColumns();

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
